const path = require('path');
const axios = require('axios');
const { loadWorkflow, validateWorkflow, getReadyTasks, getFailureHandlerTaskIds } = require('./workflowLoader');
const repo = require('../db/workflowRepository');
const { query } = require('../db/index');

// Workflow definitions are bundled inside the orchestrator image under /usr/src/app/workflow-definitions
const WORKFLOW_DEFINITIONS_DIR = path.join(__dirname, '../../workflow-definitions');

function workflowDefinitionPath(workflowName) {
  return path.join(WORKFLOW_DEFINITIONS_DIR, `${workflowName}.yaml`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowISO() {
  return new Date().toISOString();
}

/**
 * Concurrent Worker Pool for Task Execution (Appears highly scalable & queue-based)
 */
class TaskWorkerPool {
  constructor(concurrency = 3) {
    this.concurrency = concurrency;
    this.queue = [];
    this.activeWorkers = 0;
  }

  enqueue(job) {
    console.log(`[WorkerQueue] Enqueued task job ${job.taskDef.id} for workflow ${job.workflowInstanceId}`);
    this.queue.push(job);
    this.processNext();
  }

  async processNext() {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.activeWorkers++;
    const job = this.queue.shift();
    console.log(`[WorkerQueue] Starting job ${job.taskDef.id} (Active Workers: ${this.activeWorkers}/${this.concurrency})`);

    try {
      await executeTaskDirect(job.taskInstance, job.taskDef, job.workflowInstanceId, job.workflowDef);
    } catch (err) {
      console.error(`[WorkerQueue] Error processing job ${job.taskDef.id}:`, err);
    } finally {
      this.activeWorkers--;
      console.log(`[WorkerQueue] Finished job ${job.taskDef.id} (Active Workers: ${this.activeWorkers}/${this.concurrency})`);
      this.processNext();
    }
  }

  getQueueStatus() {
    return {
      queuedJobsCount: this.queue.length,
      queuedJobs: this.queue.map(j => ({ taskId: j.taskDef.id, workflowInstanceId: j.workflowInstanceId })),
      activeWorkers: this.activeWorkers,
      concurrency: this.concurrency,
    };
  }
}

const workerPool = new TaskWorkerPool(3);

/**
 * Start a workflow: load definition, create workflow instance and task instances, then execute.
 * @param {string} workflowName filename without extension (e.g. 'order-flow')
 * @param {Object} inputData
 * @returns {Promise<string>} workflow instance id
 */
async function startWorkflow(workflowName, inputData) {
  console.log('Starting workflow', workflowName);
  const workflowDef = loadWorkflow(workflowDefinitionPath(workflowName));
  validateWorkflow(workflowDef);

  // create workflow instance
  const wfRow = await repo.createWorkflow(workflowName, inputData);
  const workflowInstanceId = wfRow.id;
  console.log('Created workflow instance', workflowInstanceId);

  // audit trail event
  await repo.createWorkflowEvent(
    workflowInstanceId,
    'WORKFLOW_STARTED',
    null,
    `Workflow ${workflowName} started with input: ${JSON.stringify(inputData)}`
  );

  // Failure-handler tasks start as SKIPPED so they only run when a task jumps to them
  const failureHandlers = getFailureHandlerTaskIds(workflowDef);
  for (const taskDef of workflowDef.tasks) {
    const initialStatus = failureHandlers.has(taskDef.id) ? 'SKIPPED' : 'PENDING';
    const ti = await repo.createTaskInstance(workflowInstanceId, taskDef.id, inputData, initialStatus);
    await repo.createTaskLog(ti.id, 'INFO', `Task initialized with status: ${initialStatus}`);
  }

  // set workflow to RUNNING
  await repo.updateWorkflowStatus(workflowInstanceId, 'RUNNING');
  console.log('Workflow status set to RUNNING', workflowInstanceId);

  // start execution
  executeNextTasks(workflowInstanceId, workflowDef).catch((e) => console.error('Execution error', e));
  return workflowInstanceId;
}

/**
 * Execute next ready tasks for a workflow instance in parallel.
 * @param {string} workflowInstanceId
 * @param {Object} workflowDef
 */
async function executeNextTasks(workflowInstanceId, workflowDef) {
  console.log('Checking ready tasks for', workflowInstanceId);
  // reload workflow and tasks
  const wf = await repo.getWorkflowById(workflowInstanceId);
  if (!wf) throw new Error('Workflow instance not found: ' + workflowInstanceId);
  
  if (wf.status === 'PAUSED') {
    console.log('Workflow is paused; not executing tasks', workflowInstanceId);
    return;
  }

  // Workflow Timeout Handling
  const workflowTimeoutSeconds = workflowDef.timeout_seconds || 300; // default 5 mins
  const elapsedSeconds = (Date.now() - new Date(wf.created_at).getTime()) / 1000;
  if (elapsedSeconds > workflowTimeoutSeconds && wf.status === 'RUNNING') {
    console.log(`Workflow ${workflowInstanceId} timed out. Failing pending/running tasks.`);
    await repo.updateWorkflowStatus(workflowInstanceId, 'FAILED');
    await repo.createWorkflowEvent(workflowInstanceId, 'WORKFLOW_FAILED', null, `Workflow timed out after ${elapsedSeconds.toFixed(1)} seconds.`);
    
    // fail all running and pending tasks
    for (const t of wf.tasks || []) {
      if (['PENDING', 'RUNNING'].includes(t.status)) {
        await repo.updateTaskInstance(t.id, { status: 'FAILED', errorMessage: 'workflow_timeout', completedAt: nowISO() });
        await repo.createTaskLog(t.id, 'ERROR', 'Task aborted due to workflow timeout');
      }
    }
    return;
  }

  const taskInstances = wf.tasks || [];
  const completedTaskIds = new Set(taskInstances.filter((t) => t.status === 'COMPLETED').map((t) => t.task_id));
  const runningTaskIds = new Set(taskInstances.filter((t) => t.status === 'RUNNING').map((t) => t.task_id));

  const readyDefs = getReadyTasks(workflowDef, completedTaskIds);
  const toExecute = [];
  for (const td of readyDefs) {
    const ti = taskInstances.find((x) => x.task_id === td.id);
    if (!ti) continue;
    if (ti.status === 'SKIPPED') continue;
    if (ti.status === 'PENDING') {
      // avoid double-running
      if (!runningTaskIds.has(td.id)) toExecute.push({ taskInstance: ti, taskDef: td });
    }
  }

  if (toExecute.length === 0) {
    console.log('No ready tasks to execute for', workflowInstanceId);
    const anyFailed = taskInstances.some((t) => t.status === 'FAILED');
    const anyPendingOrRunning = taskInstances.some((t) => ['PENDING', 'RUNNING'].includes(t.status));

    // Failure path finished but success-path tasks still waiting on failed deps — close them out
    if (anyFailed && anyPendingOrRunning) {
      for (const t of taskInstances) {
        if (t.status === 'PENDING') {
          await repo.updateTaskInstance(t.id, { status: 'SKIPPED' });
          await repo.createTaskLog(t.id, 'INFO', 'Task skipped: predecessor failure');
        }
      }
      await repo.updateWorkflowStatus(workflowInstanceId, 'FAILED');
      await repo.createWorkflowEvent(workflowInstanceId, 'WORKFLOW_FAILED', null, 'Workflow failed: incomplete dependencies due to failure');
      console.log('Workflow failed (orphaned pending tasks skipped)', workflowInstanceId);
      return;
    }

    if (!anyFailed && !anyPendingOrRunning) {
      await repo.updateWorkflowStatus(workflowInstanceId, 'COMPLETED');
      await repo.createWorkflowEvent(workflowInstanceId, 'WORKFLOW_COMPLETED', null, 'Workflow finished successfully');
      console.log('Workflow completed', workflowInstanceId);
    }
    return;
  }

  // Execute in parallel by dispatching through the concurrent worker queue
  toExecute.forEach(({ taskInstance, taskDef }) => {
    executeTask(taskInstance, taskDef, workflowInstanceId, workflowDef);
  });
}

/**
 * Interface function that routes the task job into the worker queue.
 */
function executeTask(taskInstance, taskDef, workflowInstanceId, workflowDef) {
  workerPool.enqueue({ taskInstance, taskDef, workflowInstanceId, workflowDef });
}

/**
 * Execute a single task instance according to its task definition.
 * Handles exponential backoff, abortable timeouts, and human approval pause branches.
 */
async function executeTaskDirect(taskInstance, taskDef, workflowInstanceId, workflowDef) {
  console.log(`Executing task ${taskDef.id} (instance ${taskInstance.id})`);
  
  // mark running
  await repo.updateTaskInstance(taskInstance.id, { status: 'RUNNING', startedAt: nowISO() });
  await repo.createTaskLog(taskInstance.id, 'INFO', `Task execution started at ${nowISO()}`);
  await repo.createWorkflowEvent(workflowInstanceId, 'TASK_STARTED', taskDef.id, `Task ${taskDef.name} started`);

  const attemptExecute = async () => {
    // Refresh task state inside loop (in case workflow was terminated/paused while in backoff sleep)
    const currentWf = await repo.getWorkflowById(workflowInstanceId);
    if (!currentWf || currentWf.status === 'PAUSED') {
      console.log(`Workflow is paused/missing, delaying task execution: ${taskDef.id}`);
      return;
    }
    const currentTask = currentWf.tasks.find(t => t.id === taskInstance.id);
    if (currentTask && currentTask.status === 'FAILED') {
      // already failed or terminated
      return;
    }

    const currentRetry = (currentTask?.retry_count || 0) + 1;

    try {
      const body = { 
        taskId: taskDef.id, 
        workflowInstanceId, 
        input: taskInstance.input_data,
        retryCount: currentRetry - 1
      };

      // Setup AbortController for HTTP Timeout Cancellation
      const controller = new AbortController();
      const timeoutSeconds = taskDef.timeout_seconds || 30;
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutSeconds * 1000);

      await repo.createTaskLog(taskInstance.id, 'INFO', `Sending request to service: ${taskDef.service_url} (Timeout: ${timeoutSeconds}s)`);

      let res;
      try {
        res = await axios.post(taskDef.service_url, body, { signal: controller.signal });
      } catch (axiosErr) {
        if (axiosErr.name === 'CanceledError' || axiosErr.code === 'ERR_CANCELED') {
          throw new Error(`Task timeout: Exceeded limit of ${timeoutSeconds} seconds.`);
        }
        throw axiosErr;
      } finally {
        clearTimeout(timeoutId);
      }

      // Check for custom failure statuses returned in JSON payload
      if (res.data?.status === 'failed') {
        throw new Error(res.data.message || res.data.data?.reason || 'Task returned failed status');
      }

      // Human Approval Routing Hook
      if (res.data?.status === 'success' && res.data?.data?.human_approval) {
        console.log(`Task ${taskDef.id} requires human approval. Pausing workflow.`);
        await repo.updateWorkflowStatus(workflowInstanceId, 'PAUSED');
        await repo.updateTaskInstance(taskInstance.id, {
          status: 'RUNNING',
          outputData: { ...res.data, awaiting_approval: true },
        });
        
        await repo.createTaskLog(taskInstance.id, 'INFO', `Awaiting human approval. Details: ${res.data.message}`);
        await repo.createWorkflowEvent(
          workflowInstanceId,
          'WORKFLOW_PAUSED',
          taskDef.id,
          `Workflow paused: Task ${taskDef.name} requires human approval`
        );
        return;
      }

      // Successful task execution
      await repo.updateTaskInstance(taskInstance.id, {
        status: 'COMPLETED',
        outputData: res.data !== undefined ? res.data : null,
        completedAt: nowISO(),
      });
      await repo.createTaskLog(taskInstance.id, 'INFO', `Task completed. Output: ${JSON.stringify(res.data || {})}`);
      await repo.createWorkflowEvent(workflowInstanceId, 'TASK_COMPLETED', taskDef.id, `Task ${taskDef.name} completed`);

      // If we completed during a retry cycle, mark retry succeeded
      if (currentRetry > 1) {
        await repo.createWorkflowEvent(workflowInstanceId, 'RETRY_SUCCEEDED', taskDef.id, `Task ${taskDef.name} succeeded on attempt ${currentRetry}`);
      }

      // Conditional on_success branching: activate listed successor tasks (best-effort)
      if (Array.isArray(taskDef.on_success) && taskDef.on_success.length > 0) {
        const wfAfter = await repo.getWorkflowById(workflowInstanceId);
        for (const succId of taskDef.on_success) {
          const succInstance = wfAfter.tasks.find((t) => t.task_id === succId);
          if (!succInstance) continue;
          if (succInstance.status === 'PENDING') continue; // already active
          if (succInstance.status === 'COMPLETED') continue; // already completed

          await repo.updateTaskInstance(succInstance.id, { status: 'PENDING', errorMessage: null });
          await repo.createTaskLog(succInstance.id, 'INFO', `Activated via on_success branch from ${taskDef.id}`);
          await repo.createWorkflowEvent(workflowInstanceId, 'BRANCH_TAKEN', succId, `on_success branch taken from ${taskDef.id} -> ${succId}`);
        }
      }

      // Trigger next tasks
      executeNextTasks(workflowInstanceId, workflowDef).catch((e) => console.error(e));
      return;

    } catch (err) {
      console.error(`Task ${taskDef.id} error:`, err.message);
      
      // Update task instance retry status and log error
      await repo.updateTaskInstance(taskInstance.id, { retryCount: currentRetry, errorMessage: err.message });
      await repo.createTaskLog(taskInstance.id, 'ERROR', `Execution error (Attempt ${currentRetry}): ${err.message}`);
      await repo.createWorkflowEvent(
        workflowInstanceId,
        'TASK_FAILED',
        taskDef.id,
        `Task ${taskDef.name} failed attempt ${currentRetry}: ${err.message}`
      );

      const maxAttempts = (taskDef.retry && taskDef.retry.max_attempts) || 1;
      const delaySeconds = (taskDef.retry && taskDef.retry.delay_seconds) || 2;
      const backoffMultiplier = (taskDef.retry && taskDef.retry.backoff_multiplier) || 2;

      // Exponential Backoff retry dispatcher
      if (currentRetry < maxAttempts) {
        const exponentialDelay = delaySeconds * Math.pow(backoffMultiplier, currentRetry - 1);
        // mark as retrying and create retry events
        await repo.updateTaskInstance(taskInstance.id, { status: 'RETRYING', retryCount: currentRetry });
        await repo.createTaskLog(
          taskInstance.id,
          'INFO',
          `Scheduling retry ${currentRetry + 1}/${maxAttempts} in ${exponentialDelay}s (exponential backoff)`
        );
        await repo.createWorkflowEvent(workflowInstanceId, 'RETRY_ATTEMPT', taskDef.id, `Retry attempt ${currentRetry + 1}/${maxAttempts} scheduled in ${exponentialDelay}s`);
        await sleep(exponentialDelay * 1000);
        return attemptExecute();
      }

      // Exhausted all retries -> mark as max exceeded
      await repo.updateTaskInstance(taskInstance.id, { status: 'MAX_RETRIES_EXCEEDED', completedAt: nowISO() });
      await repo.createTaskLog(taskInstance.id, 'ERROR', `All ${maxAttempts} retry attempts exhausted. Marking task as MAX_RETRIES_EXCEEDED.`);
      await repo.createWorkflowEvent(workflowInstanceId, 'RETRY_FAILED', taskDef.id, `Task ${taskDef.name} retries exhausted (${maxAttempts})`);

      // If workflow termination is requested upon task failure
      if (taskDef.on_failure === 'fail_workflow') {
        console.log(`Task ${taskDef.id} failed and will fail workflow ${workflowInstanceId}`);
        await repo.updateWorkflowStatus(workflowInstanceId, 'FAILED');
        await repo.createWorkflowEvent(workflowInstanceId, 'WORKFLOW_FAILED', taskDef.id, `Workflow failed: Task ${taskDef.name} permanently failed.`);
        return;
      }

      // Compensation / Fallback Jump Targeting (support arrays)
      const onFailureTargets = Array.isArray(taskDef.on_failure) ? taskDef.on_failure : (taskDef.on_failure ? [taskDef.on_failure] : []);
      if (onFailureTargets.includes('fail_workflow')) {
        console.log(`Task ${taskDef.id} failed and will fail workflow ${workflowInstanceId}`);
        await repo.updateWorkflowStatus(workflowInstanceId, 'FAILED');
        await repo.createWorkflowEvent(workflowInstanceId, 'WORKFLOW_FAILED', taskDef.id, `Workflow failed: Task ${taskDef.name} permanently failed.`);
        return;
      }

      if (onFailureTargets.length > 0) {
        const wf = await repo.getWorkflowById(workflowInstanceId);
        for (const failureTarget of onFailureTargets) {
          const targetInstance = wf.tasks.find((t) => t.task_id === failureTarget);
          if (!targetInstance) {
            console.warn(`Failure fallback target ${failureTarget} not found in workflow ${workflowInstanceId}`);
            continue;
          }
          if (targetInstance.status === 'COMPLETED') {
            // nothing to do, but note the outcome
            await repo.createTaskLog(targetInstance.id, 'INFO', `Fallback target ${failureTarget} already completed`);
            continue;
          }

          await repo.updateTaskInstance(targetInstance.id, { status: 'PENDING', errorMessage: null });
          await repo.createTaskLog(targetInstance.id, 'INFO', `Activated as compensation/fallback path from failed task ${taskDef.id}`);
          await repo.createWorkflowEvent(
            workflowInstanceId,
            'BRANCH_TAKEN',
            failureTarget,
            `on_failure branch taken from ${taskDef.id} -> ${failureTarget}`
          );
        }
        executeNextTasks(workflowInstanceId, workflowDef).catch((e) => console.error(e));
      }
    }
  };

  return attemptExecute();
}

/**
 * Pause a workflow instance.
 * @param {string} workflowInstanceId
 */
async function pauseWorkflow(workflowInstanceId) {
  await repo.updateWorkflowStatus(workflowInstanceId, 'PAUSED');
  await repo.createWorkflowEvent(workflowInstanceId, 'WORKFLOW_PAUSED', null, 'Workflow execution paused by operator');
  console.log('Paused workflow', workflowInstanceId);
  return { success: true };
}

/**
 * Resume a paused workflow instance.
 * @param {string} workflowInstanceId
 */
async function resumeWorkflow(workflowInstanceId) {
  console.log('Resuming workflow', workflowInstanceId);
  const wfRow = await repo.getWorkflowById(workflowInstanceId);
  if (!wfRow) throw new Error('Workflow not found');

  const taskInstances = wfRow.tasks || [];
  let manualApprovalGiven = false;

  // Search for running tasks holding human approval state and complete them
  for (const t of taskInstances) {
    if (t.status === 'RUNNING' && t.output_data?.awaiting_approval) {
      console.log(`Manual human approval granted for task: ${t.task_id}`);
      await repo.updateTaskInstance(t.id, {
        status: 'COMPLETED',
        outputData: { ...t.output_data, awaiting_approval: false, approved: true, approved_at: nowISO() },
        completedAt: nowISO()
      });
      await repo.createTaskLog(t.id, 'INFO', 'Manual human approval granted. Resuming workflow.');
      manualApprovalGiven = true;
    }
  }

  // Update state back to RUNNING
  await repo.updateWorkflowStatus(workflowInstanceId, 'RUNNING');
  
  if (manualApprovalGiven) {
    await repo.createWorkflowEvent(workflowInstanceId, 'WORKFLOW_RESUMED', null, 'Workflow resumed: Human approval order released.');
  } else {
    await repo.createWorkflowEvent(workflowInstanceId, 'WORKFLOW_RESUMED', null, 'Workflow resumed by operator');
  }

  const workflowDef = loadWorkflow(workflowDefinitionPath(wfRow.workflow_name));
  executeNextTasks(workflowInstanceId, workflowDef).catch((e) => console.error(e));
  return { success: true };
}

/**
 * Retry a failed task instance by resetting it to PENDING and restarting execution.
 * @param {string} taskInstanceId
 */
async function retryFailedTask(taskInstanceId) {
  // reset task status
  await repo.updateTaskInstance(taskInstanceId, { status: 'PENDING', errorMessage: null, retryCount: 0 });
  
  // Find parent workflow directly using a single database query
  const taskRes = await query('SELECT workflow_instance_id FROM task_instances WHERE id = $1', [taskInstanceId]);
  const parentWorkflowId = taskRes.rows[0]?.workflow_instance_id;

  if (!parentWorkflowId) throw new Error('Parent workflow not found for task ' + taskInstanceId);

  const wfRow = await repo.getWorkflowById(parentWorkflowId);
  if (wfRow.status === 'FAILED') {
    await repo.updateWorkflowStatus(parentWorkflowId, 'RUNNING');
    await repo.createWorkflowEvent(parentWorkflowId, 'WORKFLOW_RESUMED', null, `Workflow set to running to retry task instance: ${taskInstanceId}`);
  }

  await repo.createTaskLog(taskInstanceId, 'INFO', 'Manual retry triggered by operator');
  await repo.createWorkflowEvent(parentWorkflowId, 'TASK_STARTED', wfRow.tasks.find(t => t.id === taskInstanceId)?.task_id, 'Manual retry started');

  // reload workflow definition and continue
  const workflowDef = loadWorkflow(workflowDefinitionPath(wfRow.workflow_name));
  executeNextTasks(parentWorkflowId, workflowDef).catch((e) => console.error(e));
  return { success: true };
}

module.exports = {
  startWorkflow,
  executeNextTasks,
  executeTask,
  pauseWorkflow,
  resumeWorkflow,
  retryFailedTask,
  workerPool,
};
