const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Base URL where our mock microservices are running
const SERVICES_BASE_URL = 'http://localhost:4000/api/services';

/**
 * Loads the DAG workflow layout from the sample_order.json file
 */
const loadWorkflowBlueprint = () => {
    try {
        const blueprintPath = path.join(__dirname, '../workflows/sample_order.json');
        const rawData = fs.readFileSync(blueprintPath, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error(`[ORCHESTRATOR ERROR] Failed to load workflow blueprint: ${error.message}`);
        return null;
    }
};

/**
 * Core Execution Engine Function
 * Coordinates running tasks based on their dependencies.
 */
const executeWorkflowInstance = async (instanceState) => {
    const blueprint = loadWorkflowBlueprint();
    if (!blueprint) {
        instanceState.status = 'FAILED';
        instanceState.logs.push('[FATAL] Workflow configuration blueprint missing.');
        return;
    }

    instanceState.logs.push(`[ORCHESTRATOR] Starting DAG parsing for: ${blueprint.name}`);
    
    // Continue running until all tasks are either SUCCESS or a fatal failure happens
    while (instanceState.status === 'RUNNING') {
        let executionFiredInThisLoop = false;
        const tasksToRunInParallel = [];

        // Check each task in the blueprint configuration
        for (const task of blueprint.tasks) {
            const currentTaskState = instanceState.tasks[task.id];

            // Only consider tasks that are currently PENDING
            if (currentTaskState.status === 'PENDING') {
                // Dependency Checker: Check if all upstream tasks in "depends_on" have completed successfully
                const allDependenciesPassed = task.depends_on.every(depId => 
                    instanceState.tasks[depId] && instanceState.tasks[depId].status === 'SUCCESS'
                );

                if (allDependenciesPassed) {
                    tasksToRunInParallel.push(task);
                }
            }
        }

        // If there are tasks ready with all dependencies cleared, fire them off in parallel!
        if (tasksToRunInParallel.length > 0) {
            executionFiredInThisLoop = true;
            instanceState.logs.push(`[ORCHESTRATOR] Bundling parallel execution block for tasks: [${tasksToRunInParallel.map(t => t.id).join(', ')}]`);

            // Execute tasks concurrently using Promise.all
            const promises = tasksToRunInParallel.map(task => runSingleTask(task, instanceState));
            await Promise.all(promises);
        }

        // Check if entire workflow lifecycle is finished
        const allTasks = Object.keys(instanceState.tasks);
        const allSuccess = allTasks.every(id => instanceState.tasks[id].status === 'SUCCESS');
        const anyFailed = allTasks.some(id => instanceState.tasks[id].status === 'FAILED');

        if (allSuccess) {
            instanceState.status = 'COMPLETED';
            instanceState.endTime = new Date();
            instanceState.logs.push('[ORCHESTRATOR] 🎉 Pipeline completed execution successfully.');
            console.log(`[Orchestrator] ✅ Workflow ${instanceState.id} finished perfectly.`);
            break;
        }

        if (anyFailed) {
            instanceState.status = 'FAILED';
            instanceState.endTime = new Date();
            instanceState.logs.push('[ORCHESTRATOR] ❌ Workflow terminated prematurely due to unrecovered step failure.');
            break;
        }

        // If no tasks were fired and we aren't done, break the loop to prevent infinite cycling
        if (!executionFiredInThisLoop) {
            await new Promise(resolve => setTimeout(resolve, 200)); // Small pause to prevent CPU burning
        }
    }
};

/**
 * Handles sending the HTTP POST request to a single microservice node with retry logic
 */
const runSingleTask = async (task, instanceState) => {
    const taskState = instanceState.tasks[task.id];
    taskState.status = 'RUNNING';
    taskState.attempts++;
    
    instanceState.logs.push(`[ORCHESTRATOR] Dispatching task [${task.id}] to endpoint ${task.endpoint} (Attempt #${taskState.attempts})`);

    try {
        // Send actual HTTP POST request to your mock microservices
        const response = await axios.post(`${SERVICES_BASE_URL}${task.endpoint}`, {
            orderId: instanceState.id,
            amount: 150.00,
            email: "customer@example.com"
        });

        if (response.status === 200 && response.data.success) {
            taskState.status = 'SUCCESS';
            instanceState.logs.push(`[${task.id.toUpperCase()} SERVICE] Response success received. Node marked clear.`);
        } else {
            throw new Error(response.data.message || "Non-200 service response");
        }
    } catch (error) {
        instanceState.logs.push(`[${task.id.toUpperCase()} SERVICE] ⚠️ Error detected: ${error.message}`);
        
        // Automated Retry Logic: Max 3 attempts
        if (taskState.attempts < 3) {
            instanceState.logs.push(`[ORCHESTRATOR] Triggering automated retry algorithm for task [${task.id}] in 2 seconds...`);
            taskState.status = 'PENDING'; // Put back to pending so the engine loops back and retries it
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying
        } else {
            taskState.status = 'FAILED';
            instanceState.logs.push(`[FATAL] Task [${task.id}] exceeded max retry limits. Marking pipeline broken.`);
        }
    }
};

module.exports = {
    executeWorkflowInstance
};