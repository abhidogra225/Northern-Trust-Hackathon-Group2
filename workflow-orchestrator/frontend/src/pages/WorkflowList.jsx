import { useEffect, useMemo, useState } from 'react';
import { getWorkflows } from '../services/api';

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Running', value: 'RUNNING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Paused', value: 'PAUSED' },
];

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export default function WorkflowList({ onViewWorkflow, onPollingStateChange }) {
  const [filter, setFilter] = useState('');
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    let intervalId;

    async function load() {
      const { data, error: apiError } = await getWorkflows({ page: 1, limit: 25, status: filter });
      if (!mounted) return;

      if (apiError) {
        setError(apiError);
        setLoading(false);
        return;
      }

      setError('');
      setWorkflows(data?.items || []);
      setLoading(false);
    }

    onPollingStateChange(true);
    load();
    intervalId = setInterval(load, 3000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
      onPollingStateChange(false);
    };
  }, [filter, onPollingStateChange]);

  const rows = useMemo(() => workflows || [], [workflows]);
  const summary = useMemo(() => {
    return {
      total: rows.length,
      running: rows.filter((item) => item.status === 'RUNNING').length,
      completed: rows.filter((item) => item.status === 'COMPLETED').length,
      failed: rows.filter((item) => item.status === 'FAILED').length,
      paused: rows.filter((item) => item.status === 'PAUSED').length,
    };
  }, [rows]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Workflow Overview</h2>
          <p className="page-subtitle">Track active orders, view failed workflows, and inspect execution details.</p>
        </div>
        <div className="filter-row">
          {FILTERS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`filter-btn ${filter === item.value ? 'active' : ''}`}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{summary.total}</span>
          <span className="stat-label">Total workflows</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{summary.running}</span>
          <span className="stat-label">Running</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{summary.completed}</span>
          <span className="stat-label">Completed</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{summary.failed}</span>
          <span className="stat-label">Failed</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{summary.paused}</span>
          <span className="stat-label">Paused</span>
        </div>
      </div>

      {error ? <div className="banner error">{error}</div> : null}
      {loading ? <p className="muted">Loading workflows...</p> : null}

      <div className="table-wrap">
        <table className="workflow-table">
          <caption className="table-caption">Latest workflow executions fetched from the orchestrator API.</caption>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Status</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((workflow) => (
              <tr key={workflow.id}>
                <td className="mono">{workflow.id.slice(0, 8)}</td>
                <td>{workflow.workflow_name}</td>
                <td>
                  <span className={`status-badge ${workflow.status}`}>{workflow.status}</span>
                </td>
                <td>{formatDate(workflow.created_at)}</td>
                <td>
                  <button type="button" className="action-btn" onClick={() => onViewWorkflow(workflow.id)}>
                    View details
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading ? (
              <tr>
                <td colSpan={5} className="empty-row">
                  No workflows found. Start a new order workflow to populate the dashboard.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
