const express = require('express');
const cors = require('cors');

// Initialize Express App
const app = express();

// Global Middleware
app.use(cors()); // Allows your frontend dashboard to make cross-origin API requests safely
app.use(express.json()); // Automatically parses incoming JSON request bodies

// Import Router Modules
const orderRoutes = require('./routes/orderRoutes');
const workflowRoutes = require('./routes/workflowRoutes');

// Mount Route Endpoints
// Mock microservices endpoints will be accessible at /api/services/payment, etc.
app.use('/api/services', orderRoutes); 

// Core orchestrator lifecycle endpoints will be accessible at /api/workflows/start-workflow, etc.
app.use('/api/workflows', workflowRoutes);

// Base Diagnostic Route to check backend status
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: "FlowOrchestra Gateway API is operational.",
        timestamp: new Date()
    });
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(`[SYSTEM ERROR] ${err.stack}`);
    res.status(500).json({
        success: false,
        message: "An unexpected internal server error occurred."
    });
});

module.exports = app;