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

// POST /api/workflows/start
router.post('/workflows/start', async (req, res) => {
  try {
    const { workflowName, inputData } = req.body || {};
    if (typeof workflowName !== 'string' || workflowName.trim().length === 0) {
      return sendResponse(res, { success: false, error: 'workflowName must be a non-empty string', status: 400 });
    }
    if (!isPlainObject(inputData)) {
      return sendResponse(res, { success: false, error: 'inputData must be a valid object', status: 400 });
    }

    const id = await engine.startWorkflow(workflowName.trim(), inputData);
    return sendResponse(res, { data: { workflowInstanceId: id, status: 'RUNNING', message: 'Workflow started' } });
  } catch (err) {
    console.error('start workflow error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to start workflow', status: 500 });
  }
});

// GET /api/workflows?page=1&limit=10&status=RUNNING
router.get('/workflows', async (req, res) => {
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
});

// GET /api/workflows/:id
router.get('/workflows/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const wf = await repo.getWorkflowById(id);
    if (!wf) return sendResponse(res, { success: false, error: 'Workflow not found', status: 404 });
    return sendResponse(res, { data: wf });
  } catch (err) {
    console.error('get workflow error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to fetch workflow', status: 500 });
  }
});

// POST /api/workflows/:id/pause
router.post('/workflows/:id/pause', async (req, res) => {
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
});

// POST /api/workflows/:id/resume
router.post('/workflows/:id/resume', async (req, res) => {
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
});

// POST /api/workflows/:id/terminate
router.post('/workflows/:id/terminate', async (req, res) => {
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
});

// POST /api/tasks/:taskId/retry
router.post('/tasks/:taskId/retry', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    await engine.retryFailedTask(taskId);
    return sendResponse(res, { data: { taskId, message: 'Retry triggered' } });
  } catch (err) {
    console.error('retry task error', err);
    return sendResponse(res, { success: false, error: err.message || 'failed to retry task', status: 500 });
  }
});

// GET /api/workflows/:id/logs
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

module.exports = router;
