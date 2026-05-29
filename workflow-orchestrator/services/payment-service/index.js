const express = require('express');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4001;

// Simple UUID generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// POST /execute
app.post('/execute', async (req, res, next) => {
  try {
    const { taskId, workflowInstanceId, input } = req.body || {};
    // artificial delay
    await new Promise((r) => setTimeout(r, 500));

    const amount = (input && input.amount) || 100;
    const tx = generateUUID();
    
    // Return success for demo (mock payment processing)
    return res.json({
      status: 'success',
      data: {
        transaction_id: tx,
        amount_processed: amount,
        status: 'approved',
      },
      message: 'Payment processed successfully',
    });
  } catch (err) {
    next(err);
  }
});

app.get('/health', (req, res) => res.json({ service: 'payment-service', status: 'healthy', port: PORT }));

// error handler
app.use((err, req, res, next) => {
  console.error('payment-service error', err);
  res.status(500).json({ status: 'failed', message: err.message || 'internal error' });
});

app.listen(PORT, () => console.log(`payment-service listening on ${PORT}`));
