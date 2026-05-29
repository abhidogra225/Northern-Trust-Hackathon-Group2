const express = require('express');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4004;

app.post('/execute', (req, res, next) => {
  try {
    const { taskId, workflowInstanceId, input } = req.body || {};
    const type = input && input.notification_type;
    const email = input && input.customer_email;

    console.log('Notification service: would send', { type, email, workflowInstanceId });

    return res.json({ status: 'success', data: { email_sent: true, sms_sent: true, recipient: email }, message: 'Notification queued' });
  } catch (err) {
    next(err);
  }
});

app.get('/health', (req, res) => res.json({ service: 'notification-service', status: 'healthy', port: PORT }));

app.use((err, req, res, next) => {
  console.error('notification-service error', err);
  res.status(500).json({ status: 'failed', message: err.message || 'internal error' });
});

app.listen(PORT, () => console.log(`notification-service listening on ${PORT}`));
