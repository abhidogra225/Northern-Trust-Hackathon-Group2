const express = require('express');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4004;

app.post('/execute', (req, res, next) => {
  try {
    const { taskId, workflowInstanceId, input } = req.body || {};
    const email = (input && input.customer_email) || (input && input.email) || 'unknown@example.com';
    const customerName = (input && input.customer_name) || 'Customer';

    let channel = 'order_update';
    let subject = 'Order update';

    if (taskId === 'send-notification-success') {
      channel = 'order_success';
      subject = `Order confirmed — thank you, ${customerName}`;
    } else if (taskId === 'send-notification-failure') {
      channel = 'order_failure';
      subject = `Order could not be completed — ${customerName}`;
    } else if (taskId === 'update-order-status') {
      channel = 'order_status_finalized';
      subject = `Final order status recorded — ${customerName}`;
    }

    console.log('Notification sent', { taskId, channel, email, workflowInstanceId });

    return res.json({
      status: 'success',
      data: {
        channel,
        subject,
        email_sent: true,
        sms_sent: Boolean(input && input.customer_phone),
        recipient: email,
        workflow_instance_id: workflowInstanceId,
      },
      message: 'Notification delivered',
    });
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
