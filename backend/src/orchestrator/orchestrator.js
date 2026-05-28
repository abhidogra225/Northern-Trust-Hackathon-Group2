const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class Orchestrator extends EventEmitter {
  constructor() {
    super();
    this.workflows = {}; // id -> workflow
    this.runs = {}; // runId -> run state
    this.loadingDir = path.join(__dirname, '..', 'workflows');
    this.loadWorkflows();
  }

  loadWorkflows() {
    try {
      if (!fs.existsSync(this.loadingDir)) return;
      const files = fs.readdirSync(this.loadingDir);
      files.forEach((f) => {
        if (f.endsWith('.json')) {
          const wf = JSON.parse(fs.readFileSync(path.join(this.loadingDir, f)));
          this.workflows[wf.id] = wf;
        }
      });
    } catch (err) {
      console.error('Failed loading workflows', err);
    }
  }

  getWorkflows() {
    return Object.values(this.workflows);
  }

  getRuns() {
    return Object.values(this.runs);
  }

  getRun(runId) {
    return this.runs[runId];
  }

  startWorkflow(workflowId) {
    const wf = this.workflows[workflowId];
    if (!wf) throw new Error('Workflow not found');

    const runId = `run_${Date.now()}`;
    const run = {
      id: runId,
      workflowId: workflowId,
      status: 'running',
      createdAt: new Date().toISOString(),
      tasks: wf.tasks.map((t) => ({ ...t, status: 'pending', attempts: 0 })),
    };

    this.runs[runId] = run;
    // start execution asynchronously
    this._executeRun(run).catch((err) => console.error('Orchestrator run error', err));
    return run;
  }

  async _executeRun(run) {
    while (true) {
      if (run.status === 'paused') {
        await this._wait(500);
        continue;
      }

      const pending = run.tasks.filter((t) => t.status === 'pending' && (t.dependsOn || []).every((d) => {
        const dep = run.tasks.find((x) => x.id === d);
        return dep && dep.status === 'completed';
      }));

      if (pending.length === 0) break;

      // run all available in parallel
      await Promise.all(pending.map((t) => this._runTask(run, t)));
    }

    // final status
    const hasFailed = run.tasks.some((t) => t.status === 'failed');
    run.status = hasFailed ? 'failed' : 'completed';
    this.emit('runUpdate', run.id, run);
  }

  async _runTask(run, task) {
    task.status = 'in-progress';
    task.startedAt = new Date().toISOString();
    this.emit('taskUpdate', run.id, task);
    try {
      if (task.type === 'http') {
        const url = task.params.url;
        const method = (task.params.method || 'POST').toUpperCase();
        const body = task.params.body || {};
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await res.text();
        task.output = { status: res.status, body: json };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        task.status = 'completed';
      } else if (task.type === 'wait') {
        await this._wait(task.params.ms || 1000);
        task.status = 'completed';
      } else if (task.type === 'log') {
        console.log('[workflow log]', task.params.message);
        task.status = 'completed';
      } else if (task.type === 'human') {
        // human approval: wait until task.approved=true set via API
        task.status = 'waiting';
        this.emit('taskUpdate', run.id, task);
        // poll approval
        while (!task.approved && run.status === 'running') {
          await this._wait(1000);
        }
        if (task.approved) task.status = 'completed'; else task.status = 'failed';
      } else {
        task.status = 'failed';
        task.error = `Unknown task type ${task.type}`;
      }
    } catch (err) {
      task.status = 'failed';
      task.error = err.message;
    }

    task.finishedAt = new Date().toISOString();
    task.attempts = (task.attempts || 0) + 1;
    this.emit('taskUpdate', run.id, task);
  }

  pauseRun(runId) {
    const run = this.runs[runId];
    if (run) run.status = 'paused';
    return run;
  }

  resumeRun(runId) {
    const run = this.runs[runId];
    if (run && run.status === 'paused') run.status = 'running';
    // trigger execution loop if needed
    if (run) this._executeRun(run).catch((e) => console.error(e));
    return run;
  }

  retryTask(runId, taskId) {
    const run = this.runs[runId];
    if (!run) throw new Error('Run not found');
    const task = run.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Task not found');
    task.status = 'pending';
    delete task.error;
    this._executeRun(run).catch((e) => console.error(e));
    return task;
  }

  approveTask(runId, taskId) {
    const run = this.runs[runId];
    if (!run) throw new Error('Run not found');
    const task = run.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Task not found');
    task.approved = true;
    return task;
  }

  _wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
}

module.exports = new Orchestrator();
