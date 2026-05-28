const inventoryService = require("../services/inventoryService");
const paymentService = require("../services/paymentService");
const shippingService = require("../services/shippingService");

exports.placeOrder = (req, res) => {
  const { productId, quantity } = req.body;

  try {
    inventoryService.checkInventory(productId, quantity);
    paymentService.processPayment();
    shippingService.shipOrder();

    res.json({
      message: "Order completed successfully ✅"
    });
  } catch (err) {
    res.status(500).json({
      message: "Order failed ❌",
      error: err.message
    });
  }
};