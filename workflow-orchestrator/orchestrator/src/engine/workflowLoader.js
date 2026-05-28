const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Load a workflow YAML file and return the parsed object.
 * @param {string} filePath Path to YAML file
 * @returns {Object} parsed workflow definition
 */
function loadWorkflow(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  const raw = fs.readFileSync(abs, 'utf8');
  const doc = yaml.load(raw);
  return doc;
}

/**
 * Validate a workflow definition object.
 * Throws an Error if validation fails.
 * Checks:
 * - tasks array exists and ids are unique
 * - all depends_on references point to real task ids
 * - no circular dependencies (DFS)
 * - required fields present on each task
 * @param {Object} workflowDef
 * @returns {boolean} true when valid
 */
function validateWorkflow(workflowDef) {
  if (!workflowDef || typeof workflowDef !== 'object') throw new Error('Invalid workflow definition');
  const tasks = workflowDef.tasks;
  if (!Array.isArray(tasks)) throw new Error('`tasks` must be an array');

  const ids = new Set();
  const idToTask = new Map();
  const errors = [];

  // Required fields per task
  const requiredFields = ['id', 'name', 'type', 'service_url', 'depends_on', 'on_failure', 'retry', 'timeout_seconds'];

  tasks.forEach((t, idx) => {
    if (!t || typeof t !== 'object') {
      errors.push(`Task at index ${idx} is not an object`);
      return;
    }
    if (typeof t.id !== 'string' || !t.id.trim()) errors.push(`Task at index ${idx} missing valid 'id'`);
    if (ids.has(t.id)) errors.push(`Duplicate task id '${t.id}'`);
    ids.add(t.id);
    idToTask.set(t.id, t);

    // check required fields presence
    requiredFields.forEach((f) => {
      if (t[f] === undefined) {
        errors.push(`Task '${t.id}': missing required field '${f}'`);
      }
    });

    // type check
    if (t.type && !['http', 'db_update'].includes(t.type)) {
      errors.push(`Task '${t.id}': invalid type '${t.type}'`);
    }

    // depends_on must be array
    if (t.depends_on && !Array.isArray(t.depends_on)) {
      errors.push(`Task '${t.id}': 'depends_on' must be an array`);
    }

    // retry shape
    if (t.retry) {
      if (typeof t.retry !== 'object') errors.push(`Task '${t.id}': 'retry' must be an object`);
      else {
        if (typeof t.retry.max_attempts !== 'number') errors.push(`Task '${t.id}': 'retry.max_attempts' must be a number`);
        if (typeof t.retry.delay_seconds !== 'number') errors.push(`Task '${t.id}': 'retry.delay_seconds' must be a number`);
      }
    }

    // timeout_seconds must be number
    if (t.timeout_seconds !== undefined && typeof t.timeout_seconds !== 'number') {
      errors.push(`Task '${t.id}': 'timeout_seconds' must be a number`);
    }
  });

  // depends_on references exist
  tasks.forEach((t) => {
    const deps = t.depends_on || [];
    deps.forEach((d) => {
      if (!idToTask.has(d)) errors.push(`Task '${t.id}': depends_on references unknown task '${d}'`);
    });
  });

  // cycle detection using DFS
  const WHITE = 0, GREY = 1, BLACK = 2;
  const state = {};
  ids.forEach((id) => (state[id] = WHITE));

  function dfs(node) {
    state[node] = GREY;
    const deps = idToTask.get(node).depends_on || [];
    for (const neigh of deps) {
      if (state[neigh] === GREY) {
        return [`Cycle detected: ${node} -> ${neigh}`];
      }
      if (state[neigh] === WHITE) {
        const res = dfs(neigh);
        if (res) return res;
      }
    }
    state[node] = BLACK;
    return null;
  }

  for (const id of ids) {
    if (state[id] === WHITE) {
      const cycleRes = dfs(id);
      if (cycleRes) errors.push(...cycleRes);
    }
  }

  if (errors.length) throw new Error('Workflow validation errors:\n' + errors.join('\n'));
  return true;
}

/**
 * Given a workflow definition and a set (or array) of completed task ids,
 * return an array of task objects whose dependencies are all satisfied.
 * Does not include tasks already completed.
 * @param {Object} workflowDef
 * @param {Set|string[] } completedTaskIds
 * @returns {Array<Object>} ready tasks
 */
function getReadyTasks(workflowDef, completedTaskIds) {
  const completed = completedTaskIds instanceof Set ? completedTaskIds : new Set(completedTaskIds || []);
  const tasks = workflowDef.tasks || [];
  const ready = [];
  for (const t of tasks) {
    if (completed.has(t.id)) continue; // already done
    const deps = t.depends_on || [];
    const allMet = deps.every((d) => completed.has(d));
    if (allMet) ready.push(t);
  }
  return ready;
}

/**
 * Task ids used only as on_failure jump targets (should not auto-run at workflow start).
 * @param {Object} workflowDef
 * @returns {Set<string>}
 */
function getFailureHandlerTaskIds(workflowDef) {
  const ids = new Set();
  for (const task of workflowDef.tasks || []) {
    if (task.on_failure && task.on_failure !== 'fail_workflow') {
      ids.add(task.on_failure);
    }
  }
  return ids;
}

module.exports = {
  loadWorkflow,
  validateWorkflow,
  getReadyTasks,
  getFailureHandlerTaskIds,
};
