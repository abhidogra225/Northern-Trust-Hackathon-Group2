const express = require('express');
const router = express.Router();
const orchestrator = require('../orchestrator/orchestrator');

router.get('/workflows', (req, res) => {
  res.json(orchestrator.getWorkflows());
});

router.post('/workflows/run', (req, res) => {
  try {
    const { workflowId } = req.body;
    const run = orchestrator.startWorkflow(workflowId);
    res.json(run);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/runs', (req, res) => {
  res.json(orchestrator.getRuns());
});

router.get('/runs/:id', (req, res) => {
  const run = orchestrator.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

router.post('/runs/:id/action', (req, res) => {
  const { action, taskId } = req.body;
  const runId = req.params.id;
  try {
    let result;
    if (action === 'pause') result = orchestrator.pauseRun(runId);
    else if (action === 'resume') result = orchestrator.resumeRun(runId);
    else if (action === 'retry') result = orchestrator.retryTask(runId, taskId);
    else if (action === 'approve') result = orchestrator.approveTask(runId, taskId);
    else if (action === 'terminate') { const run = orchestrator.getRun(runId); if (run) run.status = 'terminated'; result = run; }
    else throw new Error('Unknown action');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
