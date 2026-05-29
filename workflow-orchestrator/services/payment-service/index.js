const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4001;

app.post('/execute', async (req, res, next) => {
  try {
    const { taskId, workflowInstanceId, input } = req.body || {};
    await new Promise((r) => setTimeout(r, 500));

    const amount = Number((input && input.amount) || 0);
    const card = String((input && input.card_number) || '').replace(/\s/g, '');

    if (taskId === 'check-fraud') {
      const risky = amount > 5000;
      if (risky) {
        return res.json({
          status: 'failed',
          data: { reason: 'fraud_suspected' },
          message: 'Fraud check failed',
        });
      }
      return res.json({
        status: 'success',
        data: { fraud_score: 12, cleared: true },
        message: 'Fraud check passed',
      });
    }

    if (amount > 10000) {
      return res.json({
        status: 'success',
        data: { human_approval: true, amount },
        message: 'Requires human approval',
      });
    }

    if (card.endsWith('0000')) {
      return res.json({
        status: 'failed',
        data: { reason: 'card_declined' },
        message: 'Card declined',
      });
    }

    const rnd = Math.random();
    if (rnd <= 0.9) {
      return res.json({
        status: 'success',
        data: {
          transaction_id: uuidv4(),
          charged_amount: amount,
          timestamp: new Date().toISOString(),
        },
        message: 'Charged successfully',
      });
    }

    const reasons = ['insufficient_funds', 'card_declined'];
    const reason = reasons[Math.floor(Math.random() * reasons.length)];
    return res.json({ status: 'failed', data: { reason }, message: 'Payment failed' });
  } catch (err) {
    next(err);
  }
});

app.get('/health', (req, res) => res.json({ service: 'payment-service', status: 'healthy', port: PORT }));

app.use((err, req, res, next) => {
  console.error('payment-service error', err);
  res.status(500).json({ status: 'failed', message: err.message || 'internal error' });
});

app.listen(PORT, () => console.log(`payment-service listening on ${PORT}`));
