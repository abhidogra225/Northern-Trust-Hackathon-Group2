const path = require('path');
const axios = require('axios');
const { loadWorkflow, validateWorkflow, getReadyTasks, getFailureHandlerTaskIds } = require('./workflowLoader');
const repo = require('../db/workflowRepository');

const WORKFLOW_DEFINITIONS_DIR = path.join(__dirname, '../../../workflow-definitions');

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

  // Failure-handler tasks start as SKIPPED so they only run when a task jumps to them
  const failureHandlers = getFailureHandlerTaskIds(workflowDef);
  for (const taskDef of workflowDef.tasks) {
    const initialStatus = failureHandlers.has(taskDef.id) ? 'SKIPPED' : 'PENDING';
    await repo.createTaskInstance(workflowInstanceId, taskDef.id, inputData, initialStatus);
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
        }
      }
      await repo.updateWorkflowStatus(workflowInstanceId, 'FAILED');
      console.log('Workflow failed (orphaned pending tasks skipped)', workflowInstanceId);
      return;
    }

    if (!anyFailed && !anyPendingOrRunning) {
      await repo.updateWorkflowStatus(workflowInstanceId, 'COMPLETED');
      console.log('Workflow completed', workflowInstanceId);
    }
    return;
  }

  // Execute in parallel
  await Promise.allSettled(toExecute.map(({ taskInstance, taskDef }) => executeTask(taskInstance, taskDef, workflowInstanceId, workflowDef)));
}

/**
 * Execute a single task instance according to its task definition.
 * Handles retries, timeouts, and failure branches.
 * @param {Object} taskInstance DB row for task_instances
 * @param {Object} taskDef Task definition from workflow
 * @param {string} workflowInstanceId
 * @param {Object} workflowDef
 */
async function executeTask(taskInstance, taskDef, workflowInstanceId, workflowDef) {
  console.log(`Executing task ${taskDef.id} (instance ${taskInstance.id})`);
  // mark running
  await repo.updateTaskInstance(taskInstance.id, { status: 'RUNNING', startedAt: nowISO() });

  const attemptExecute = async () => {
    try {
      // construct request
      const body = { taskId: taskDef.id, workflowInstanceId, input: taskInstance.input_data };

      // create a timeout promise
      const timeoutMs = (taskDef.timeout_seconds || 30) * 1000;
      const axiosPromise = axios.post(taskDef.service_url, body);
      const res = await Promise.race([
        axiosPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('Task timeout')), timeoutMs)),
      ]);

      if (res.data?.status === 'failed') {
        throw new Error(res.data.message || res.data.data?.reason || 'Task returned failed status');
      }

      // success
      await repo.updateTaskInstance(taskInstance.id, {
        status: 'COMPLETED',
        outputData: res.data !== undefined ? res.data : null,
        completedAt: nowISO(),
      });
      console.log(`Task ${taskDef.id} completed`);

      // trigger next tasks
      executeNextTasks(workflowInstanceId, workflowDef).catch((e) => console.error(e));
      return;
    } catch (err) {
      console.error(`Task ${taskDef.id} error:`, err.message);
      // increment retry count
      const currentRetry = (taskInstance.retry_count || 0) + 1;
      await repo.updateTaskInstance(taskInstance.id, { retryCount: currentRetry, errorMessage: err.message });

      const maxAttempts = (taskDef.retry && taskDef.retry.max_attempts) || 0;
      const delaySeconds = (taskDef.retry && taskDef.retry.delay_seconds) || 1;

      if (currentRetry < maxAttempts) {
        console.log(`Retrying task ${taskDef.id} in ${delaySeconds}s (attempt ${currentRetry}/${maxAttempts})`);
        // refresh taskInstance from DB
        const refreshed = (await repo.getWorkflowById(workflowInstanceId)).tasks.find((t) => t.id === taskInstance.id);
        await sleep(delaySeconds * 1000);
        return attemptExecute();
      }

      // exhausted retries
      await repo.updateTaskInstance(taskInstance.id, { status: 'FAILED', completedAt: nowISO() });

      if (taskDef.on_failure === 'fail_workflow') {
        console.log(`Task ${taskDef.id} failed and will fail workflow ${workflowInstanceId}`);
        await repo.updateWorkflowStatus(workflowInstanceId, 'FAILED');
        return;
      }

      // jump to failure task id
      const failureTarget = taskDef.on_failure;
      console.log(`Task ${taskDef.id} failed, jumping to ${failureTarget}`);
      // find target task instance and set to PENDING
      const wf = await repo.getWorkflowById(workflowInstanceId);
      const targetInstance = wf.tasks.find((t) => t.task_id === failureTarget);
      if (targetInstance) {
        if (targetInstance.status === 'COMPLETED') {
          await repo.updateWorkflowStatus(workflowInstanceId, 'FAILED');
          executeNextTasks(workflowInstanceId, workflowDef).catch((e) => console.error(e));
          return;
        }
        await repo.updateTaskInstance(targetInstance.id, { status: 'PENDING', errorMessage: null });
        executeNextTasks(workflowInstanceId, workflowDef).catch((e) => console.error(e));
      } else {
        console.warn(`Failure target ${failureTarget} not found in workflow ${workflowInstanceId}`);
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
  console.log('Paused workflow', workflowInstanceId);
  return { success: true };
}

/**
 * Resume a paused workflow instance.
 * @param {string} workflowInstanceId
 */
async function resumeWorkflow(workflowInstanceId) {
  console.log('Resuming workflow', workflowInstanceId);
  await repo.updateWorkflowStatus(workflowInstanceId, 'RUNNING');
  // reload workflow def from file referenced by workflow_name in DB
  const wfRow = await repo.getWorkflowById(workflowInstanceId);
  if (!wfRow) throw new Error('Workflow not found');
  const workflowName = wfRow.workflow_name;
  const workflowDef = loadWorkflow(workflowDefinitionPath(workflowName));
  executeNextTasks(workflowInstanceId, workflowDef).catch((e) => console.error(e));
  return { success: true };
}

/**
 * Retry a failed task instance by resetting it to PENDING and restarting execution.
 * @param {string} taskInstanceId
 */
async function retryFailedTask(taskInstanceId) {
  // reset task
  await repo.updateTaskInstance(taskInstanceId, { status: 'PENDING', errorMessage: null });
  // ensure workflow is running
  // find parent workflow id by fetching workflow via repo.getAllWorkflows isn't helpful; instead use getWorkflowById searches tasks
  // We'll find the workflow by scanning all workflows (inefficient but acceptable for scaffold)
  const all = await repo.getAllWorkflows(1000, 0);
  let parentWorkflowId = null;
  for (const wf of all) {
    const wfFull = await repo.getWorkflowById(wf.id);
    if (wfFull.tasks.some((t) => t.id === taskInstanceId)) {
      parentWorkflowId = wf.id;
      break;
    }
  }
  if (!parentWorkflowId) throw new Error('Parent workflow not found for task ' + taskInstanceId);

  const wfRow = await repo.getWorkflowById(parentWorkflowId);
  if (wfRow.status === 'FAILED') await repo.updateWorkflowStatus(parentWorkflowId, 'RUNNING');

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
};
