import { useEffect, useMemo, useState } from 'react';
import {
  getWorkflowById,
  pauseWorkflow,
  resumeWorkflow,
  retryTask,
  terminateWorkflow,
} from '../services/api';

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function getDuration(startedAt, completedAt) {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return `${seconds}s`;
}

function statusIcon(status) {
  if (status === 'COMPLETED') return '✓';
  if (status === 'FAILED') return '✕';
  if (status === 'RUNNING') return '●';
  if (status === 'PAUSED') return '‖';
  return '○';
}

function groupTasks(tasks) {
  const sorted = [...tasks].sort((a, b) => {
    const aTime = a.started_at || a.completed_at || '';
    const bTime = b.started_at || b.completed_at || '';
    return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
  });

  const groups = [];
  for (const task of sorted) {
    const key = task.started_at ? new Date(task.started_at).toISOString().slice(0, 19) : task.task_id;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.key === key) {
      lastGroup.tasks.push(task);
    } else {
      groups.push({ key, tasks: [task] });
    }
  }
  return groups;
}

export default function WorkflowDetail({ workflowId, onBack, onPollingStateChange }) {
  const [workflow, setWorkflow] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    let intervalId;

    async function load() {
      const { data, error: apiError } = await getWorkflowById(workflowId);
      if (!mounted) return;
      if (apiError) {
        setError(apiError);
        return;
      }
      setError('');
      setWorkflow(data);
    }

    onPollingStateChange(true);
    load();
    intervalId = setInterval(load, 3000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
      onPollingStateChange(false);
    };
  }, [workflowId, onPollingStateChange]);

  const taskGroups = useMemo(() => groupTasks(workflow?.tasks || []), [workflow]);

  async function runControlAction(actionFn) {
    setActionLoading(true);
    setActionError('');
    const { error: apiError } = await actionFn();
    if (apiError) {
      setActionError(apiError);
    }
    setActionLoading(false);
  }

  if (error) {
    return (
      <div className="page">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Back to workflows
        </button>
        <div className="banner error">{error}</div>
      </div>
    );
  }

  if (!workflow) {
    return <div className="page muted">Loading workflow details...</div>;
  }

  return (
    <div className="page">
      <button type="button" className="link-btn" onClick={onBack}>
        ← Back to workflows
      </button>

      <div className="detail-header card">
        <div className="detail-header-top">
          <div>
            <h2>Workflow Details</h2>
            <p className="page-subtitle">Review order progress, task status, and workflow actions.</p>
          </div>
          <span className={`status-badge ${workflow.status}`}>{workflow.status}</span>
        </div>

        <div className="detail-grid">
          <div>
            <p className="detail-label">Workflow ID</p>
            <p className="mono">{workflow.id}</p>
          </div>
          <div>
            <p className="detail-label">Created on</p>
            <p>{formatDate(workflow.created_at)}</p>
          </div>
          <div>
            <p className="detail-label">Input payload</p>
            <pre className="json-block compact">{JSON.stringify(workflow.input_data || {}, null, 2)}</pre>
          </div>
        </div>
      </div>

      <div className="section-header">
        <h3>Task execution timeline</h3>
        <p className="page-subtitle">Each task shows status, timing, and output details.</p>
      </div>

      <div className="pipeline">
        {taskGroups.map((group, index) => (
          <div key={group.key} className="pipeline-row">
            {group.tasks.map((task) => (
              <div key={task.id} className="task-card card">
                <div className="task-head">
                  <div>
                    <h3>{task.task_id}</h3>
                    <p className="mono">{task.id.slice(0, 8)}</p>
                  </div>
                  <span className={`status-badge ${task.status}`}>
                    {statusIcon(task.status)} {task.status}
                  </span>
                </div>

                <div className="task-meta">
                  <div>
                    <p className="detail-label">Started</p>
                    <p>{formatDate(task.started_at)}</p>
                  </div>
                  <div>
                    <p className="detail-label">Duration</p>
                    <p>{getDuration(task.started_at, task.completed_at)}</p>
                  </div>
                </div>

                <details>
                  <summary>Task output</summary>
                  <pre className="json-block">{JSON.stringify(task.output_data || {}, null, 2)}</pre>
                </details>

                {task.error_message ? <p className="error-text">Error: {task.error_message}</p> : null}

                {task.status === 'FAILED' ? (
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => runControlAction(() => retryTask(task.id))}
                    disabled={actionLoading}
                  >
                    Retry task
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>

      {actionError ? <div className="banner error">{actionError}</div> : null}

      <div className="control-row">
        {workflow.status === 'RUNNING' ? (
          <button
            type="button"
            className="action-btn"
            disabled={actionLoading}
            onClick={() => runControlAction(() => pauseWorkflow(workflow.id))}
          >
            Pause workflow
          </button>
        ) : null}

        {workflow.status === 'PAUSED' ? (
          <button
            type="button"
            className="action-btn"
            disabled={actionLoading}
            onClick={() => runControlAction(() => resumeWorkflow(workflow.id))}
          >
            Resume workflow
          </button>
        ) : null}

        {['RUNNING', 'PAUSED'].includes(workflow.status) ? (
          <button
            type="button"
            className="action-btn danger"
            disabled={actionLoading}
            onClick={() => {
              const confirmTerminate = window.confirm('Terminate this workflow?');
              if (!confirmTerminate) return;
              runControlAction(() => terminateWorkflow(workflow.id));
            }}
          >
            Terminate workflow
          </button>
        ) : null}
      </div>
    </div>
  );
}
