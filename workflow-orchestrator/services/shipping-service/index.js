const express = require('express');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4003;

function randomDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

app.post('/execute', async (req, res, next) => {
  try {
    const { taskId, workflowInstanceId, input } = req.body || {};
    await new Promise((r) => setTimeout(r, 300));

    const address = input && input.address;
    if (!address) {
      return res.json({ status: 'failed', data: { reason: 'missing_address' }, message: 'Address missing' });
    }

    const tracking = 'TRK-' + randomDigits(8);
    const couriers = ['FedEx', 'UPS', 'DHL', 'BlueDart'];
    const courier = couriers[Math.floor(Math.random() * couriers.length)];
    const days = 3 + Math.floor(Math.random() * 5); // 3-7
    const est = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const labelUrl = `https://labels.example.com/${tracking}.pdf`;

    return res.json({
      status: 'success',
      data: { tracking_number: tracking, courier, estimated_delivery: est, label_url: labelUrl },
      message: 'Shipment created',
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
