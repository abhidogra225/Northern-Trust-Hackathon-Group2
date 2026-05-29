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

  // Required fields per task (minimal: id and type)
  const requiredFields = ['id', 'type'];

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

    // depends_on must be array when present
    if (t.depends_on !== undefined && !Array.isArray(t.depends_on)) {
      errors.push(`Task '${t.id}': 'depends_on' must be an array when present`);
    }

    // on_success may be an array of task ids
    if (t.on_success !== undefined && !Array.isArray(t.on_success)) {
      errors.push(`Task '${t.id}': 'on_success' must be an array of task ids when present`);
    }

    // on_failure may be array, a single string task id, or the special string 'fail_workflow'
    if (
      t.on_failure !== undefined &&
      !(Array.isArray(t.on_failure) || typeof t.on_failure === 'string')
    ) {
      errors.push(`Task '${t.id}': 'on_failure' must be an array, a task id string, or 'fail_workflow' when present`);
    }

    // retry shape (optional)
    if (t.retry) {
      if (typeof t.retry !== 'object') errors.push(`Task '${t.id}': 'retry' must be an object`);
      else {
        if (t.retry.max_attempts !== undefined && typeof t.retry.max_attempts !== 'number') errors.push(`Task '${t.id}': 'retry.max_attempts' must be a number`);
        if (t.retry.delay_seconds !== undefined && typeof t.retry.delay_seconds !== 'number') errors.push(`Task '${t.id}': 'retry.delay_seconds' must be a number`);
      }
    }

    // timeout_seconds must be number when present
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

  // Validate on_success and on_failure references exist
  tasks.forEach((t) => {
    const succs = t.on_success || [];
    succs.forEach((s) => {
      if (!idToTask.has(s)) errors.push(`Task '${t.id}': on_success references unknown task '${s}'`);
    });
    if (Array.isArray(t.on_failure)) {
      t.on_failure.forEach((s) => {
        if (!idToTask.has(s)) errors.push(`Task '${t.id}': on_failure references unknown task '${s}'`);
      });
    }
  });

  // cycle detection using DFS across depends_on and conditional branches
  const WHITE = 0, GREY = 1, BLACK = 2;
  const state = {};
  ids.forEach((id) => (state[id] = WHITE));

  function dfs(node) {
    state[node] = GREY;
    // neighbors include depends_on, on_success, and on_failure branches
    const task = idToTask.get(node);
    const neighs = new Set([...(task.depends_on || []), ...(task.on_success || [])]);
    if (Array.isArray(task.on_failure)) task.on_failure.forEach((n) => neighs.add(n));

    for (const neigh of neighs) {
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
    if (Array.isArray(task.on_failure)) {
      for (const t of task.on_failure) ids.add(t);
    } else if (task.on_failure && task.on_failure !== 'fail_workflow') {
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
