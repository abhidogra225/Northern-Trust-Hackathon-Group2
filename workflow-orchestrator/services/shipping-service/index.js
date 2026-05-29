const express = require('express');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4003;

app.post('/execute', async (req, res, next) => {
  try {
    const { taskId, workflowInstanceId, input } = req.body || {};
    await new Promise((r) => setTimeout(r, 500));

    const trackingNumber = `TRACK-${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Return success for demo (mock shipping)
    return res.json({
      status: 'success',
      data: { tracking_number: trackingNumber, carrier: 'FedEx', estimated_delivery: '2-3 days' },
      message: 'Shipment created successfully',
    });
  } catch (err) {
    next(err);
  }
});

app.get('/health', (req, res) => res.json({ service: 'shipping-service', status: 'healthy', port: PORT }));

app.use((err, req, res, next) => {
  console.error('shipping-service error', err);
  res.status(500).json({ status: 'failed', message: err.message || 'internal error' });
});

app.listen(PORT, () => console.log(`shipping-service listening on ${PORT}`));
 
