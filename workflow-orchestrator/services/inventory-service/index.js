const express = require('express');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4002;

// simple in-memory inventory
const inventory = {
  'ITEM-001': 500,
  'ITEM-002': 500,
  'ITEM-003': 500,
  'ITEM-004': 500,
  'ITEM-005': 500,
};

app.post('/execute', (req, res, next) => {
  try {
    const { taskId, workflowInstanceId, input } = req.body || {};
    const itemId = (input && input.item_id) || 'ITEM-001';
    const qty = Number((input && input.quantity) || 1);

    // Return success for demo purposes (mock inventory check)
    return res.json({
      status: 'success',
      data: { reserved_quantity: qty, remaining_stock: 100, warehouse_id: 'WH-1', itemId },
      message: 'Inventory check passed',
    });
  } catch (err) {
    next(err);
  }
});

app.get('/health', (req, res) => res.json({ service: 'inventory-service', status: 'healthy', port: PORT }));

app.use((err, req, res, next) => {
  console.error('inventory-service error', err);
  res.status(500).json({ status: 'failed', message: err.message || 'internal error' });
});

app.listen(PORT, () => console.log(`inventory-service listening on ${PORT}`));
