const express = require('express');
const router = express.Router();

// Import the services we just created
const paymentService = require('../services/paymentService');
const inventoryService = require('../services/inventoryService');
const shippingService = require('../services/shippingService');
const notificationService = require('../services/notificationService');

// Map endpoints to their respective service functions
router.post('/payment', paymentService.processPayment);
router.post('/inventory', inventoryService.reserveInventory);
router.post('/shipping', shippingService.arrangeShipping);
router.post('/notify', notificationService.sendNotification);

module.exports = router;