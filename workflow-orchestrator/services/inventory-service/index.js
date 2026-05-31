const express = require('express');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4002;

/** Generous stock for repeated demo runs without service restart. */
const INITIAL_INVENTORY = {
  'ITEM-001': 10000,
  'ITEM-002': 0,
  'ITEM-003': 10000,
  'ITEM-004': 5000,
  'ITEM-005': 5000,
};

const inventory = { ...INITIAL_INVENTORY };

function stockFor(itemId) {
  return Object.prototype.hasOwnProperty.call(inventory, itemId) ? inventory[itemId] : null;
}

app.post('/execute', (req, res, next) => {
  try {
    const { taskId, input } = req.body || {};
    const itemId = input && input.item_id;
    const qty = Number((input && input.quantity) || 0);

    if (!itemId || stockFor(itemId) === null) {
      return res.json({
        status: 'failed',
        data: { reason: 'item_not_found' },
        message: 'Item not found',
      });
    }

    if (qty <= 0) {
      return res.json({
        status: 'failed',
        data: { reason: 'invalid_quantity' },
        message: 'Quantity must be greater than zero',
      });
    }

    const available = inventory[itemId];

    if (taskId === 'validate-order') {
      if (available <= 0) {
        return res.json({
          status: 'failed',
          data: { reason: 'out_of_stock', remaining_stock: available },
          message: 'Item out of stock',
        });
      }
      if (available < qty) {
        return res.json({
          status: 'failed',
          data: { reason: 'insufficient_stock', remaining_stock: available, requested: qty },
          message: 'Insufficient stock for order quantity',
        });
      }
      return res.json({
        status: 'success',
        data: { valid: true, item_id: itemId, available, requested: qty },
        message: 'Order validated',
      });
    }

    if (available <= 0 || available < qty) {
      return res.json({
        status: 'failed',
        data: { reason: 'out_of_stock', remaining_stock: available },
        message: 'Out of stock',
      });
    }

    inventory[itemId] -= qty;
    return res.json({
      status: 'success',
      data: {
        reserved_quantity: qty,
        remaining_stock: inventory[itemId],
        warehouse_id: 'WH-1',
      },
      message: 'Reserved',
    });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/reset-inventory', (req, res) => {
  Object.keys(INITIAL_INVENTORY).forEach((key) => {
    inventory[key] = INITIAL_INVENTORY[key];
  });
  res.json({ status: 'success', data: inventory, message: 'Inventory reset to initial levels' });
});

app.get('/health', (req, res) =>
  res.json({ service: 'inventory-service', status: 'healthy', port: PORT, inventory })
);

app.use((err, req, res, next) => {
  console.error('inventory-service error', err);
  res.status(500).json({ status: 'failed', message: err.message || 'internal error' });
});

app.listen(PORT, () => console.log(`inventory-service listening on ${PORT}`));
