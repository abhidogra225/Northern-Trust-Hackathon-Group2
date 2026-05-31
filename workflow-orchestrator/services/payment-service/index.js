const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4001;

/** Amounts above this require human approval on process-payment. */
const HUMAN_APPROVAL_THRESHOLD = 10000;
/** Mid-range amounts flagged on check-fraud (below human-approval tier). */
const FRAUD_FLAG_THRESHOLD = 5000;

app.post('/execute', async (req, res, next) => {
  try {
    const { taskId, input } = req.body || {};
    await new Promise((r) => setTimeout(r, 400));

    const amount = Number((input && input.amount) || 0);
    const card = String((input && input.card_number) || '').replace(/\s/g, '');

    if (taskId === 'check-fraud') {
      // High-value orders are cleared on process-payment via human approval
      if (amount > HUMAN_APPROVAL_THRESHOLD) {
        return res.json({
          status: 'success',
          data: { fraud_score: 6, cleared: true, note: 'high_value_human_approved_tier' },
          message: 'Fraud check passed (high-value pre-approval tier)',
        });
      }
      if (amount > FRAUD_FLAG_THRESHOLD) {
        return res.json({
          status: 'failed',
          data: { reason: 'fraud_suspected', amount },
          message: 'Fraud check failed — amount exceeds automated limit',
        });
      }
      return res.json({
        status: 'success',
        data: { fraud_score: 12, cleared: true },
        message: 'Fraud check passed',
      });
    }

    if (taskId === 'process-payment' && amount > HUMAN_APPROVAL_THRESHOLD) {
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

    if (!card || card.length < 12) {
      return res.json({
        status: 'failed',
        data: { reason: 'invalid_card' },
        message: 'Invalid card number',
      });
    }

    return res.json({
      status: 'success',
      data: {
        transaction_id: uuidv4(),
        charged_amount: amount,
        timestamp: new Date().toISOString(),
      },
      message: 'Charged successfully',
    });
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
