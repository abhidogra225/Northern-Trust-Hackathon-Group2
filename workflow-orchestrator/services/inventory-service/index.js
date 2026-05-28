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
    const itemId = input && input.item_id;
    const qty = Number((input && input.quantity) || 0);

    if (!itemId || !inventory.hasOwnProperty(itemId)) {
      return res.json({ status: 'failed', data: { reason: 'item_not_found' }, message: 'Item not found' });
    }

    if (inventory[itemId] <= 0 || inventory[itemId] < qty) {
      return res.json({ status: 'failed', data: { reason: 'out_of_stock' }, message: 'Out of stock' });
    }

    inventory[itemId] -= qty;
    return res.json({
      status: 'success',
      data: { reserved_quantity: qty, remaining_stock: inventory[itemId], warehouse_id: 'WH-1' },
      message: 'Reserved',
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
