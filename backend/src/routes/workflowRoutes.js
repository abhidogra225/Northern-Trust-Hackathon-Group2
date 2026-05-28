const express = require('express');
const router = express.Router();
const { executeWorkflowInstance } = require('../orchestrator/orchestrator');

// Mock in-memory database to store workflow states for the dashboard
// Key will be the workflowInstanceId
const workflowStates = {};

// 1. POST /start-workflow -> Starts execution
router.post('/start-workflow', async (req, res) => {
    const { workflowId, orderDetails } = req.body;
    
    if (!workflowId) {
        return res.status(400).json({ success: false, message: "Missing workflowId" });
    }

    const instanceId = `wf-run-${Math.floor(Math.random() * 90000) + 10000}`;
    
    // Initialize the tracking state structure
    workflowStates[instanceId] = {
        id: instanceId,
        workflowType: workflowId,
        status: 'RUNNING',
        startTime: new Date(),
        tasks: {
            payment: { status: 'PENDING', attempts: 0 },
            inventory: { status: 'PENDING', attempts: 0 },
            shipping: { status: 'PENDING', attempts: 0 },
            notify: { status: 'PENDING', attempts: 0 }
        },
        logs: [`[ORCHESTRATOR] Initialized workflow instance ${instanceId}`]
    };
    executeWorkflowInstance(workflowStates[instanceId]);

    console.log(`[Orchestrator] ⚡ Starting workflow instance: ${instanceId}`);

    // Respond immediately to the frontend client so the dashboard stays non-blocking
    res.status(202).json({
        success: true,
        message: "Workflow execution started",
        workflowInstanceId: instanceId
    });

    // NOTE: This is where Member 1 (Vedant) will tie in his executeWorkflow(instanceId) 
    // function asynchronously or pass it to his DAG execution engine!
});

// 2. GET /workflow/:id -> Returns the status map for Member 4's graph coloring & tracking
router.get('/:id', (req, res) => {
    const instanceId = req.params.id;
    const state = workflowStates[instanceId];

    if (!state) {
        return res.status(404).json({ success: false, message: "Workflow instance not found" });
    }

    res.status(200).json({ success: true, data: state });
});

// 3. POST /retry-task/:id -> Manually retries a specific stalled/failed node step
router.post('/retry-task/:id', (req, res) => {
    const instanceId = req.params.id;
    const { taskId } = req.body;
    const state = workflowStates[instanceId];

    if (!state) {
        return res.status(404).json({ success: false, message: "Workflow instance not found" });
    }

    if (state.tasks[taskId]) {
        state.tasks[taskId].status = 'RETRYING';
        state.logs.push(`[ORCHESTRATOR] Manual retry requested for step: ${taskId}`);
        console.log(`[Orchestrator] 🔄 Manual retry triggered for ${taskId} on ${instanceId}`);
        
        // Return updated object back to UI
        return res.status(200).json({ success: true, message: `Retrying task ${taskId}`, data: state });
    }

    res.status(400).json({ success: false, message: "Invalid task ID provided" });
});




module.exports = router;