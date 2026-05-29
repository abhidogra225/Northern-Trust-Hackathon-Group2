const express = require('express');
const router = express.Router();

const engine = require('../engine/orchestratorEngine');
const repo = require('../db/workflowRepository');

function sendResponse(res, { success = true, data = null, error = null, status = 200 }) {
  return res.status(status).json({ success, data: data || {}, error: error || null, timestamp: new Date().toISOString() });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Helper to handle workflow starting logic
 */
async function handleWorkflowStart(req, res) {
  try {
    const { workflowName, inputData } = req.body || {};
    const name = typeof workflowName === 'string' ? workflowName.trim() : 'order-flow';
    
    if (!isPlainObject(inputData)) {
      return sendResponse(res, { success: false, error: 'inputData must be a valid object', status: 400 });
    }

    const id = await engine.startWorkflow(name, inputData);
    return sendResponse(res, { data: { workflowInstanceId: id, status: 'RUNNING', message: 'Workflow started' } });
  } catch (err) {
    console.error('start workflow error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to start workflow', status: 500 });
  }
}

/**
 * Helper to retrieve paginated list
 */
async function handleWorkflowList(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    const { items, total } = await repo.getWorkflowsPaginated({ limit, offset, status: statusFilter });
    return sendResponse(res, {
      data: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        items,
      },
    });
  } catch (err) {
    console.error('list workflows error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to list workflows', status: 500 });
  }
}

/**
 * Direct and standard Start route mapping
 */
router.post('/workflows/start', handleWorkflowStart);
router.post('/workflow/start', handleWorkflowStart);

/**
 * Direct and standard List route mapping
 */
router.get('/workflows', handleWorkflowList);
router.get('/workflow/all', handleWorkflowList);

/**
 * Direct and standard Single workflow details / status
 */
async function handleWorkflowDetails(req, res) {
  try {
    const id = req.params.id;
    const wf = await repo.getWorkflowById(id);
    if (!wf) return sendResponse(res, { success: false, error: 'Workflow not found', status: 404 });
    return sendResponse(res, { data: wf });
  } catch (err) {
    console.error('get workflow error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to fetch workflow', status: 500 });
  }
}
router.get('/workflows/:id', handleWorkflowDetails);
router.get('/workflow/:id/status', handleWorkflowDetails);
router.get('/workflow/:id', handleWorkflowDetails);

/**
 * Direct and standard Pause
 */
async function handleWorkflowPause(req, res) {
  try {
    const id = req.params.id;
    const wf = await repo.getWorkflowById(id);
    if (!wf) return sendResponse(res, { success: false, error: 'Workflow not found', status: 404 });
    await engine.pauseWorkflow(id);
    return sendResponse(res, { data: { workflowInstanceId: id, status: 'PAUSED', message: 'Workflow paused' } });
  } catch (err) {
    console.error('pause workflow error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to pause', status: 500 });
  }
}
router.post('/workflows/:id/pause', handleWorkflowPause);
router.post('/workflow/:id/pause', handleWorkflowPause);

/**
 * Direct and standard Resume
 */
async function handleWorkflowResume(req, res) {
  try {
    const id = req.params.id;
    const wf = await repo.getWorkflowById(id);
    if (!wf) return sendResponse(res, { success: false, error: 'Workflow not found', status: 404 });
    await engine.resumeWorkflow(id);
    return sendResponse(res, { data: { workflowInstanceId: id, status: 'RUNNING', message: 'Workflow resumed' } });
  } catch (err) {
    console.error('resume workflow error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to resume', status: 500 });
  }
}
router.post('/workflows/:id/resume', handleWorkflowResume);
router.post('/workflow/:id/resume', handleWorkflowResume);

/**
 * Direct and standard Terminate
 */
async function handleWorkflowTerminate(req, res) {
  try {
    const id = req.params.id;
    const wf = await repo.getWorkflowById(id);
    if (!wf) return sendResponse(res, { success: false, error: 'Workflow not found', status: 404 });
    await repo.terminateWorkflow(id);
    return sendResponse(res, {
      data: {
        workflowInstanceId: id,
        status: 'FAILED',
        reason: 'manually_terminated',
        message: 'Workflow terminated',
      },
    });
  } catch (err) {
    console.error('terminate workflow error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to terminate', status: 500 });
  }
}
router.post('/workflows/:id/terminate', handleWorkflowTerminate);
router.post('/workflow/:id/terminate', handleWorkflowTerminate);

/**
 * Task and Workflow Retry API
 */
async function handleTaskRetry(req, res) {
  try {
    const taskId = req.params.taskId || req.params.id; // supports both
    await engine.retryFailedTask(taskId);
    return sendResponse(res, { data: { taskId, message: 'Retry triggered' } });
  } catch (err) {
    console.error('retry task error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to retry task', status: 500 });
  }
}
router.post('/tasks/:taskId/retry', handleTaskRetry);
router.post('/workflow/:id/retry', async (req, res) => {
  // If retrying a full workflow, find the failed task inside it and retry it!
  try {
    const id = req.params.id;
    const wf = await repo.getWorkflowById(id);
    if (!wf) return sendResponse(res, { success: false, error: 'Workflow not found', status: 404 });
    
    const failedTask = (wf.tasks || []).find((t) => t.status === 'FAILED');
    if (!failedTask) {
      return sendResponse(res, { success: false, error: 'No failed tasks found to retry in this workflow', status: 400 });
    }

    await engine.retryFailedTask(failedTask.id);
    return sendResponse(res, { data: { workflowInstanceId: id, taskId: failedTask.id, message: 'Retry triggered on failed task' } });
  } catch (err) {
    console.error('workflow retry error', err);
    return sendResponse(res, { success: false, error: err.message, status: 500 });
  }
});

/**
 * System Events / Audit Trail logs
 */
router.get('/workflows/:id/events', async (req, res) => {
  try {
    const id = req.params.id;
    const events = await repo.getWorkflowEvents(id);
    return sendResponse(res, { data: events });
  } catch (err) {
    console.error('workflow events error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to fetch workflow events', status: 500 });
  }
});

/**
 * Standard logs route (combines task list and outputs chronologically)
 */
router.get('/workflows/:id/logs', async (req, res) => {
  try {
    const id = req.params.id;
    const wf = await repo.getWorkflowById(id);
    if (!wf) return sendResponse(res, { success: false, error: 'Workflow not found', status: 404 });
    const logs = (wf.tasks || [])
      .slice()
      .sort((a, b) => {
        const A = a.started_at || a.completed_at || '';
        const B = b.started_at || b.completed_at || '';
        return A < B ? -1 : A > B ? 1 : 0;
      })
      .map((task) => {
        const statusChanges = Array.isArray(task.output_data?.status_changes) ? task.output_data.status_changes : [];
        return {
          taskInstanceId: task.id,
          taskId: task.task_id,
          startedAt: task.started_at,
          completedAt: task.completed_at,
          currentStatus: task.status,
          statusChanges,
          outputData: task.output_data,
          error: task.error_message,
        };
      });
    return sendResponse(res, { data: { workflowInstanceId: id, logs } });
  } catch (err) {
    console.error('workflow logs error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to fetch logs', status: 500 });
  }
});

/**
 * Worker Queue status endpoint (scalability insight telemetry)
 */
router.get('/queue/status', (req, res) => {
  try {
    return sendResponse(res, { data: engine.workerPool.getQueueStatus() });
  } catch (err) {
    return sendResponse(res, { success: false, error: err.message, status: 500 });
  }
});

module.exports = router;
