/* eslint-disable no-console */
const axios = require('axios');

const API_BASE_URL = process.env.ORCHESTRATOR_API || 'http://localhost:3000/api';
const POLL_INTERVAL_MS = 1000;

const successPayload = {
  customer_name: 'Rahul Sharma',
  customer_email: 'rahul@test.com',
  customer_phone: '9876543210',
  item_id: 'ITEM-001',
  quantity: 2,
  amount: 1500,
  card_number: '4111111111111111',
  address: '123 MG Road, Pune, Maharashtra',
};

const failurePayload = {
  ...successPayload,
  card_number: '4111111111110000',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countStatuses(tasks) {
  return tasks.reduce(
    (acc, task) => {
      if (task.status === 'COMPLETED') acc.completed += 1;
      if (task.status === 'FAILED') acc.failed += 1;
      if (task.status === 'RUNNING') acc.running += 1;
      if (task.status === 'PENDING') acc.pending += 1;
      return acc;
    },
    { completed: 0, failed: 0, running: 0, pending: 0 }
  );
}

function renderLiveTable(testName, workflow, elapsedMs) {
  const tasks = workflow.tasks || [];
  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  const rows = tasks.map((task) => ({
    taskId: task.task_id,
    status: task.status,
    startedAt: task.started_at ? new Date(task.started_at).toLocaleTimeString() : '-',
    completedAt: task.completed_at ? new Date(task.completed_at).toLocaleTimeString() : '-',
    error: task.error_message || '-',
  }));

  const counts = countStatuses(tasks);
  console.clear();
  console.log(`=== ${testName} ===`);
  console.log(`Workflow ID: ${workflow.id}`);
  console.log(`Workflow Status: ${workflow.status}`);
  console.log(
    `Elapsed: ${elapsedSeconds}s | Completed: ${counts.completed} | Failed: ${counts.failed} | Running: ${counts.running} | Pending: ${counts.pending}`
  );
  console.log('');
  console.table(rows);
}

async function startWorkflow(payload) {
  const response = await axios.post(`${API_BASE_URL}/workflows/start`, {
    workflowName: 'order-flow',
    inputData: payload,
  });

  if (!response.data?.success) {
    throw new Error(response.data?.error || 'Failed to start workflow');
  }

  return response.data.data.workflowInstanceId;
}

async function fetchWorkflow(workflowId) {
  const response = await axios.get(`${API_BASE_URL}/workflows/${workflowId}`);
  if (!response.data?.success) {
    throw new Error(response.data?.error || 'Failed to fetch workflow');
  }
  return response.data.data;
}

async function runScenario(testName, payload) {
  console.log(`\nStarting ${testName}...`);
  const startedAt = Date.now();
  const workflowInstanceId = await startWorkflow(payload);

  let workflow = null;
  while (true) {
    workflow = await fetchWorkflow(workflowInstanceId);
    renderLiveTable(testName, workflow, Date.now() - startedAt);

    if (workflow.status === 'COMPLETED' || workflow.status === 'FAILED') {
      break;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  const totalTimeMs = Date.now() - startedAt;
  const tasks = workflow.tasks || [];
  const completed = tasks.filter((task) => task.status === 'COMPLETED').length;
  const failed = tasks.filter((task) => task.status === 'FAILED').length;

  console.log('\nFinal Summary');
  console.log('-------------');
  console.log(`Scenario: ${testName}`);
  console.log(`Workflow ID: ${workflow.id}`);
  console.log(`Workflow Result: ${workflow.status}`);
  console.log(`Total Time: ${(totalTimeMs / 1000).toFixed(2)}s`);
  console.log(`Tasks Completed: ${completed}`);
  console.log(`Tasks Failed: ${failed}`);

  return workflow;
}

async function main() {
  try {
    console.log(`Using API: ${API_BASE_URL}`);
    const successWorkflow = await runScenario('SUCCESS SCENARIO', successPayload);
    const failureWorkflow = await runScenario('FAILURE SCENARIO', failurePayload);

    const failureTask = (failureWorkflow.tasks || []).find((task) => task.task_id === 'send-notification-failure');
    const failurePathWorked = Boolean(failureTask && failureTask.status === 'COMPLETED' && failureWorkflow.status === 'FAILED');

    console.log('\nTest Run Completed');
    console.log('==================');
    console.log(`Success scenario ended with: ${successWorkflow.status}`);
    console.log(`Failure scenario ended with: ${failureWorkflow.status}`);
    console.log(
      `Failure branch check (send-notification-failure + workflow FAILED): ${
        failurePathWorked ? 'PASS' : 'FAIL'
      }`
    );

    if (!failurePathWorked) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('\nTest run failed:', error.message);
    process.exitCode = 1;
  }
}

main();
