const app = require("./app");

// Define the execution port
const PORT = process.env.PORT || 4000;

// Start the centralized system listener
const server = app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(` 🚀  FLOWORCHESTRA CENTRAL GATEWAY SYSTEM INITIALIZED`);
    console.log(`================================================================`);
    console.log(` 👉 Main Gateway Status Check : http://localhost:${PORT}/`);
    console.log(` 👉 Mock Microservices Active: http://localhost:${PORT}/api/services/`);
    console.log(` 👉 Workflow Engine Lifecycle : http://localhost:${PORT}/api/workflows/`);
    console.log(`================================================================`);
    console.log(`[SYSTEM] Standing by for incoming pipeline triggers...`);
});

// Graceful Shutdown Handler to clean up resources if the server is stopped (Ctrl+C)
process.on('SIGINT', () => {
    console.log('\n[SYSTEM] Shutting down FlowOrchestra operational engine safely...');
    server.close(() => {
        console.log('[SYSTEM] Server listener terminated. Offline.');
        process.exit(0);
    });
});