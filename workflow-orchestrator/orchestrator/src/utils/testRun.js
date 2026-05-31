/* eslint-disable no-console */
const axios = require('axios');

const API_BASE_URL = process.env.ORCHESTRATOR_API || 'http://localhost:3000/api';
const POLL_INTERVAL_MS = 800;
const MAX_WAIT_MS = 120000;

const SCENARIOS = {
  success: {
    name: 'SUCCESS SCENARIO',
    payload: {
      customer_name: 'Abhi Dogra',
      customer_email: 'abhi.dogra@northerntrust.com',
      customer_phone: '+1 555 019 9999',
      item_id: 'ITEM-001',
      quantity: 2,
      amount: 250,
      card_number: '4111222233334444',
      address: 'Northern Trust HQ, Chicago, IL, USA',
    },
    assert(workflow) {
      const tasks = taskMap(workflow);
      return (
        workflow.status === 'COMPLETED' &&
        tasks['validate-order']?.status === 'COMPLETED' &&
        tasks['process-payment']?.status === 'COMPLETED' &&
        tasks['create-shipment']?.status === 'COMPLETED' &&
        tasks['update-order-status']?.status === 'COMPLETED' &&
        tasks['send-notification-failure']?.status === 'SKIPPED'
      );
    },
  },
  cardDeclined: {
    name: 'CARD DECLINED FAILURE',
    payload: {
      customer_name: 'John Doe',
      customer_email: 'john.doe@example.com',
      customer_phone: '+1 555 010 0000',
      item_id: 'ITEM-001',
      quantity: 1,
      amount: 80,
      card_number: '4111222233330000',
      address: '123 Main Street, Springfield, USA',
    },
    assert(workflow) {
      const tasks = taskMap(workflow);
      const paymentFailed =
        tasks['process-payment']?.status === 'MAX_RETRIES_EXCEEDED' ||
        tasks['process-payment']?.status === 'FAILED';
      return (
        workflow.status === 'FAILED' &&
        paymentFailed &&
        tasks['send-notification-failure']?.status === 'COMPLETED' &&
        tasks['check-inventory']?.status === 'SKIPPED'
      );
    },
  },
  humanApproval: {
    name: 'HUMAN APPROVAL STEP',
    payload: {
      customer_name: 'Rich Buyer',
      customer_email: 'rich@example.com',
      customer_phone: '+1 555 999 1111',
      item_id: 'ITEM-003',
      quantity: 5,
      amount: 15000,
      card_number: '4111222233334444',
      address: 'Penthouse Suite, Beverly Hills, CA, USA',
    },
    requiresResume: true,
    assert(workflow) {
      const tasks = taskMap(workflow);
      return (
        workflow.status === 'COMPLETED' &&
        tasks['process-payment']?.status === 'COMPLETED' &&
        tasks['check-fraud']?.status === 'COMPLETED' &&
        tasks['update-order-status']?.status === 'COMPLETED'
      );
    },
  },
  shippingRetry: {
    name: 'SHIPPING RETRY SIMULATION',
    payload: {
      customer_name: 'Mark Smith',
      customer_email: 'mark.smith@example.com',
      customer_phone: '+1 555 456 7890',
      item_id: 'ITEM-001',
      quantity: 3,
      amount: 450,
      card_number: '4111222233334444',
      address: 'FAIL - Temporary Carrier Pickup Block',
    },
    assert(workflow) {
      const tasks = taskMap(workflow);
      const shipment = tasks['create-shipment'];
      return (
        workflow.status === 'COMPLETED' &&
        shipment?.status === 'COMPLETED' &&
        (shipment?.retry_count || 0) >= 1
      );
    },
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function taskMap(workflow) {
  return (workflow.tasks || []).reduce((acc, task) => {
    acc[task.task_id] = task;
    return acc;
  }, {});
}

function countStatuses(tasks) {
  return tasks.reduce(
    (acc, task) => {
      const s = task.status;
      if (s === 'COMPLETED') acc.completed += 1;
      else if (s === 'FAILED' || s === 'MAX_RETRIES_EXCEEDED') acc.failed += 1;
      else if (s === 'RUNNING' || s === 'RETRYING') acc.running += 1;
      else if (s === 'PENDING') acc.pending += 1;
      else if (s === 'SKIPPED') acc.skipped += 1;
      else acc.other += 1;
      return acc;
    },
    { completed: 0, failed: 0, running: 0, pending: 0, skipped: 0, other: 0 }
  );
}

function renderLiveTable(testName, workflow, elapsedMs) {
  const tasks = workflow.tasks || [];
  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  const rows = tasks.map((task) => ({
    taskId: task.task_id,
    status: task.status,
    retries: task.retry_count || 0,
    error: task.error_message ? task.error_message.slice(0, 40) : '-',
  }));

  const counts = countStatuses(tasks);
  console.clear();
  console.log(`=== ${testName} ===`);
  console.log(`Workflow ID: ${workflow.id}`);
  console.log(`Workflow Status: ${workflow.status}`);
  console.log(
    `Elapsed: ${elapsedSeconds}s | Done: ${counts.completed} | Failed: ${counts.failed} | Running: ${counts.running} | Pending: ${counts.pending} | Skipped: ${counts.skipped}`
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

async function resumeWorkflow(workflowId) {
  const response = await axios.post(`${API_BASE_URL}/workflows/${workflowId}/resume`);
  if (!response.data?.success) {
    throw new Error(response.data?.error || 'Failed to resume workflow');
  }
}

async function resetInventory() {
  try {
    await axios.post('http://127.0.0.1:4002/admin/reset-inventory');
  } catch {
    // optional — service may not expose admin route in older builds
  }
}

async function runScenario(scenarioKey) {
  const scenario = SCENARIOS[scenarioKey];
  console.log(`\nStarting ${scenario.name}...`);
  const startedAt = Date.now();
  const workflowInstanceId = await startWorkflow(scenario.payload);

  let workflow = null;
  let resumed = false;

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    workflow = await fetchWorkflow(workflowInstanceId);
    renderLiveTable(scenario.name, workflow, Date.now() - startedAt);

    if (scenario.requiresResume && workflow.status === 'PAUSED' && !resumed) {
      const paymentTask = (workflow.tasks || []).find((t) => t.task_id === 'process-payment');
      if (paymentTask?.output_data?.awaiting_approval) {
        console.log('\n→ Simulating operator approval (POST /resume)...');
        await resumeWorkflow(workflowInstanceId);
        resumed = true;
      }
    }

    if (workflow.status === 'COMPLETED' || workflow.status === 'FAILED') {
      break;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  if (!workflow) {
    throw new Error(`${scenario.name}: workflow never loaded`);
  }

  if (workflow.status !== 'COMPLETED' && workflow.status !== 'FAILED') {
    throw new Error(`${scenario.name}: timed out in status ${workflow.status}`);
  }

  const passed = scenario.assert(workflow);
  const totalTimeMs = Date.now() - startedAt;

  console.log('\nFinal Summary');
  console.log('-------------');
  console.log(`Scenario: ${scenario.name}`);
  console.log(`Workflow Result: ${workflow.status}`);
  console.log(`Total Time: ${(totalTimeMs / 1000).toFixed(2)}s`);
  console.log(`Assertions: ${passed ? 'PASS ✓' : 'FAIL ✕'}`);

  return { scenario: scenario.name, workflow, passed, totalTimeMs };
}

async function main() {
  const results = [];

  try {
    console.log(`Using API: ${API_BASE_URL}`);
    await resetInventory();

    for (const key of Object.keys(SCENARIOS)) {
      results.push(await runScenario(key));
      await sleep(500);
    }

    console.log('\n========================================');
    console.log('           TEST RUN SUMMARY');
    console.log('========================================');

    let allPassed = true;
    for (const result of results) {
      const mark = result.passed ? 'PASS ✓' : 'FAIL ✕';
      console.log(`${mark}  ${result.scenario} (${result.workflow.status}, ${(result.totalTimeMs / 1000).toFixed(1)}s)`);
      if (!result.passed) allPassed = false;
    }

    console.log('========================================');
    console.log(allPassed ? 'All scenarios passed.' : 'One or more scenarios failed.');
    process.exitCode = allPassed ? 0 : 1;
  } catch (error) {
    console.error('\nTest run failed:', error.message);
    process.exitCode = 1;
  }
}

main();
