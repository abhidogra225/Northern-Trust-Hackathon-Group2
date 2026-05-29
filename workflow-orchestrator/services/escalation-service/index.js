const express = require('express');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4010;

app.post('/execute', (req, res, next) => {
  try {
    const { taskId, workflowInstanceId, input } = req.body || {};
    console.log('Escalation service: raising escalation', { taskId, workflowInstanceId, details: input });
    // Simulate alerting / paging logic
    return res.json({ status: 'success', data: { escalated: true }, message: 'Escalation raised' });
  } catch (err) {
    next(err);
  }
});

app.get('/health', (req, res) => res.json({ service: 'escalation-service', status: 'healthy', port: PORT }));

app.use((err, req, res, next) => {
  console.error('escalation-service error', err);
  res.status(500).json({ status: 'failed', message: err.message || 'internal error' });
});

app.listen(PORT, () => console.log(`escalation-service listening on ${PORT}`));
