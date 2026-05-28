const express = require("express");
const cors = require("cors");

const orderRoutes = require("./routes/orderRoutes");
const workflowRoutes = require("./routes/workflowRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", orderRoutes);
app.use("/api", workflowRoutes);

// Mock microservice endpoints for demo purposes
app.post('/mock/payment', (req, res) => {
	const { amount } = req.body || {};
	// simulate failure for amounts > 1000
	if (amount && amount > 1000) return res.status(402).json({ status: 'failed', reason: 'insufficient funds' });
	setTimeout(() => res.json({ status: 'ok', transactionId: `tx_${Date.now()}` }), 600);
});

app.post('/mock/inventory', (req, res) => {
	const { quantity } = req.body || {};
	// simulate out-of-stock when quantity > 5
	if (quantity && quantity > 5) return res.status(409).json({ status: 'out_of_stock' });
	setTimeout(() => res.json({ status: 'available' }), 400);
});

app.post('/mock/shipping', (req, res) => {
	setTimeout(() => res.json({ status: 'shipped', carrier: req.body?.carrier || 'UPS', tracking: `T${Date.now()}` }), 800);
});

module.exports = app;