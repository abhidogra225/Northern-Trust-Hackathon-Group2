const { query } = require('./index');
const eventBus = require('../events/eventBus');

/**
 * Create a new workflow instance.
 * @param {string} name Workflow name/id
 * @param {Object} inputData JSON-serializable input data
 * @returns {Promise<Object>} inserted workflow_instance row
 */
async function createWorkflow(name, inputData) {
  const sql = `
    INSERT INTO workflow_instances (workflow_name, status, input_data)
    VALUES ($1, 'PENDING', $2)
    RETURNING *
  `;
  const res = await query(sql, [name, inputData]);
  return res.rows[0];
}

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const WORKFLOW_DEFINITIONS_DIR = path.join(__dirname, '../../../workflow-definitions');

function workflowDefinitionPath(workflowName) {
  return path.join(WORKFLOW_DEFINITIONS_DIR, `${workflowName}.yaml`);
}

/**
 * Get a workflow instance by id, including its task instances and dynamic definition.
 * @param {string} id Workflow instance UUID
 * @returns {Promise<Object|null>} workflow row with `tasks` array, `definition` object or null
 */
async function getWorkflowById(id) {
  const wfRes = await query('SELECT * FROM workflow_instances WHERE id = $1', [id]);
  const wf = wfRes.rows[0];
  if (!wf) return null;
  const tasksRes = await query('SELECT * FROM task_instances WHERE workflow_instance_id = $1 ORDER BY id', [id]);
  wf.tasks = tasksRes.rows;

  // dynamically load the definition from the YAML file
  try {
    const yamlPath = workflowDefinitionPath(wf.workflow_name);
    if (fs.existsSync(yamlPath)) {
      const raw = fs.readFileSync(yamlPath, 'utf8');
      wf.definition = yaml.load(raw);
    }
  } catch (err) {
    console.error('Error loading workflow definition inside repository:', err.message);
  }
  return wf;
}

/**
 * Update the status of a workflow instance.
 * @param {string} id Workflow instance UUID
 * @param {string} status New status (PENDING, RUNNING, PAUSED, COMPLETED, FAILED)
 * @returns {Promise<void>}
 */
async function updateWorkflowStatus(id, status) {
  await query('UPDATE workflow_instances SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
}

/**
 * Create a new task instance for a workflow.
 * @param {string} workflowInstanceId UUID of parent workflow instance
 * @param {string} taskId Task identifier from workflow definition
 * @param {Object} inputData JSON-serializable input data
 * @returns {Promise<Object>} inserted task_instances row
 */
async function createTaskInstance(workflowInstanceId, taskId, inputData, status = 'PENDING') {
  const sql = `
    INSERT INTO task_instances (workflow_instance_id, task_id, status, input_data)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const res = await query(sql, [workflowInstanceId, taskId, status, inputData]);
  return res.rows[0];
}

/**
 * Update a task instance fields.
 * @param {string} id Task instance UUID
 * @param {Object} updates Object with optional keys: status, outputData, errorMessage, retryCount, startedAt, completedAt
 * @returns {Promise<Object>} updated task_instances row
 */
async function updateTaskInstance(id, updates) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (updates.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(updates.status);
  }
  if (updates.outputData !== undefined) {
    fields.push(`output_data = $${idx++}`);
    values.push(updates.outputData);
  }
  if (updates.errorMessage !== undefined) {
    fields.push(`error_message = $${idx++}`);
    values.push(updates.errorMessage);
  }
  if (updates.retryCount !== undefined) {
    fields.push(`retry_count = $${idx++}`);
    values.push(updates.retryCount);
  }
  if (updates.startedAt !== undefined) {
    fields.push(`started_at = $${idx++}`);
    values.push(updates.startedAt);
  }
  if (updates.completedAt !== undefined) {
    fields.push(`completed_at = $${idx++}`);
    values.push(updates.completedAt);
  }

  if (fields.length === 0) {
    const res = await query('SELECT * FROM task_instances WHERE id = $1', [id]);
    return res.rows[0];
  }

  // ensure updated_at isn't present on task table per schema; only update task fields
  const sql = `UPDATE task_instances SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
  values.push(id);
  const res = await query(sql, values);
  return res.rows[0];
}

/**
 * Get workflows for dashboard listing.
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Array>} array of workflow_instance rows
 */
async function getAllWorkflows(limit = 50, offset = 0) {
  const res = await query('SELECT * FROM workflow_instances ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
  return res.rows;
}

/**
 * Get paginated workflows with optional status filter and task counts.
 * @param {Object} params
 * @param {number} params.limit
 * @param {number} params.offset
 * @param {string|undefined} params.status
 * @returns {Promise<{items:Array,total:number}>}
 */
async function getWorkflowsPaginated({ limit = 10, offset = 0, status }) {
  const hasFilter = typeof status === 'string' && status.trim().length > 0;
  const baseParams = [];
  let whereClause = '';
  if (hasFilter) {
    baseParams.push(status.trim());
    whereClause = `WHERE w.status = $${baseParams.length}`;
  }

  const listSql = `
    SELECT
      w.*,
      COUNT(t.id)::int AS task_count,
      COUNT(*) FILTER (WHERE t.status = 'COMPLETED')::int AS completed_task_count,
      COUNT(*) FILTER (WHERE t.status = 'FAILED')::int AS failed_task_count,
      COUNT(*) FILTER (WHERE t.status = 'RUNNING')::int AS running_task_count,
      COUNT(*) FILTER (WHERE t.status = 'PENDING')::int AS pending_task_count
    FROM workflow_instances w
    LEFT JOIN task_instances t ON t.workflow_instance_id = w.id
    ${whereClause}
    GROUP BY w.id
    ORDER BY w.created_at DESC
    LIMIT $${baseParams.length + 1}
    OFFSET $${baseParams.length + 2}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM workflow_instances w
    ${whereClause}
  `;

  const listRes = await query(listSql, [...baseParams, limit, offset]);
  const countRes = await query(countSql, baseParams);
  return { items: listRes.rows, total: countRes.rows[0]?.total || 0 };
}

/**
 * Mark workflow as manually terminated and fail in-flight tasks.
 * @param {string} workflowId
 * @returns {Promise<void>}
 */
async function terminateWorkflow(workflowId) {
  await query('UPDATE workflow_instances SET status = $2, updated_at = now() WHERE id = $1', [workflowId, 'FAILED']);
  await query(
    `
      UPDATE task_instances
      SET
        status = CASE
          WHEN status IN ('PENDING', 'RUNNING') THEN 'FAILED'::task_status
          ELSE status
        END,
        error_message = CASE
          WHEN status IN ('PENDING', 'RUNNING') THEN 'manually_terminated'
          ELSE error_message
        END,
        completed_at = CASE
          WHEN status IN ('PENDING', 'RUNNING') THEN now()
          ELSE completed_at
        END,
        output_data = CASE
          WHEN status IN ('PENDING', 'RUNNING')
            THEN COALESCE(output_data, '{}'::jsonb) || '{"status_changes":[{"status":"FAILED","reason":"manually_terminated"}]}'::jsonb
          ELSE output_data
        END
      WHERE workflow_instance_id = $1
    `,
    [workflowId]
  );
}

/**
 * Create a new event for a workflow instance.
 */
async function createWorkflowEvent(workflowInstanceId, eventType, taskId = null, message = null) {
  const sql = `
    INSERT INTO workflow_events (workflow_instance_id, event_type, task_id, message)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const res = await query(sql, [workflowInstanceId, eventType, taskId, message]);
  const inserted = res.rows[0];

  // Attempt to publish the event to the Redis event bus (best-effort)
  try {
    const payload = {
      type: eventType,
      workflowId: workflowInstanceId,
      taskId: taskId,
      message: message,
      timestamp: new Date().toISOString(),
      eventId: inserted.id,
    };
    await eventBus.publish(payload);
    console.log('Published event to Redis:', payload.type, payload.workflowId, payload.taskId);
  } catch (err) {
    console.warn('Failed to publish event to Redis event bus:', err.message || err);
  }
  return res.rows[0];
}

/**
 * Get all events for a workflow instance.
 */
async function getWorkflowEvents(workflowInstanceId) {
  const sql = 'SELECT * FROM workflow_events WHERE workflow_instance_id = $1 ORDER BY created_at ASC';
  const res = await query(sql, [workflowInstanceId]);
  return res.rows;
}

/**
 * Persist an external event received via the event bus without re-publishing it.
 */
async function createExternalWorkflowEvent(workflowInstanceId, eventType, taskId = null, message = null) {
  const sql = `
    INSERT INTO workflow_events (workflow_instance_id, event_type, task_id, message)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const res = await query(sql, [workflowInstanceId, eventType, taskId, message]);
  return res.rows[0];
}

/**
 * Create a new log for a task instance.
 */
async function createTaskLog(taskInstanceId, logLevel, message) {
  const sql = `
    INSERT INTO task_logs (task_instance_id, log_level, message)
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  const res = await query(sql, [taskInstanceId, logLevel, message]);
  return res.rows[0];
}

/**
 * Get all logs for a task instance.
 */
async function getTaskLogs(taskInstanceId) {
  const sql = 'SELECT * FROM task_logs WHERE task_instance_id = $1 ORDER BY created_at ASC';
  const res = await query(sql, [taskInstanceId]);
  return res.rows;
}

module.exports = {
  createWorkflow,
  getWorkflowById,
  updateWorkflowStatus,
  createTaskInstance,
  updateTaskInstance,
  getAllWorkflows,
  getWorkflowsPaginated,
  terminateWorkflow,
  createWorkflowEvent,
  getWorkflowEvents,
  createTaskLog,
  getTaskLogs,
  createExternalWorkflowEvent,
};

