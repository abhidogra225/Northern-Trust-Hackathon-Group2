import { useEffect, useMemo, useState } from 'react';
import { getWorkflows, getQueueStatus } from '../services/api';

const FILTERS = [
  { label: 'All Workflows', value: '' },
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
  const [queueMetrics, setQueueMetrics] = useState({ queuedJobsCount: 0, activeWorkers: 0, concurrency: 3 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    let intervalId;

    async function load() {
      const { data, error: apiError } = await getWorkflows({ page: 1, limit: 25, status: filter });
      const qRes = await getQueueStatus();

      if (!mounted) return;

      if (apiError) {
        setError(apiError);
        setLoading(false);
        return;
      }

      setError('');
      setWorkflows(data?.items || []);
      if (qRes.data) {
        setQueueMetrics(qRes.data);
      }
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
    // If filtered, we can use filtered counts, but it is better to return counts of all loaded workflows
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
      
      {/* Upper header section */}
      <div className="page-header">
        <div>
          <h2>Orchestrator Dashboard</h2>
          <p className="page-subtitle">Track active orders, view failed workflows, and inspect live task metrics.</p>
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

      {/* Concurrent Worker Queue Telemetry widget */}
      <div className="queue-widget">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.2rem' }}>⚡</span>
          <div>
            <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: '600', color: '#fff' }}>
              Worker Queue Telemetry
            </h4>
            <p className="page-subtitle" style={{ fontSize: '0.78rem', marginTop: '0.1rem' }}>
              Database-backed polling workers executing DAG tasks in parallel.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.85rem' }}>
          <span className={`queue-pill ${queueMetrics.activeWorkers > 0 ? 'active' : ''}`}>
            ● Active Workers: <strong>{queueMetrics.activeWorkers}/{queueMetrics.concurrency}</strong>
          </span>
          <span className="queue-pill">
            🗂 Queue Depth: <strong>{queueMetrics.queuedJobsCount}</strong>
          </span>
          <span className="queue-pill" style={{ color: 'var(--color-success)', borderColor: 'rgba(16,185,129,0.25)' }}>
            ✓ Engine: <strong>Stateless Ready</strong>
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{summary.total}</span>
          <span className="stat-label">Total Workflows</span>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--color-primary)' }}>
          <span className="stat-value" style={{ color: '#93c5fd' }}>{summary.running}</span>
          <span className="stat-label">Running</span>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--color-success)' }}>
          <span className="stat-value" style={{ color: '#a7f3d0' }}>{summary.completed}</span>
          <span className="stat-label">Completed</span>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--color-failed)' }}>
          <span className="stat-value" style={{ color: '#fecdd3' }}>{summary.failed}</span>
          <span className="stat-label">Failed</span>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--color-warning)' }}>
          <span className="stat-value" style={{ color: '#fde68a' }}>{summary.paused}</span>
          <span className="stat-label">Paused</span>
        </div>
      </div>

      {error ? <div className="banner error">{error}</div> : null}

      {/* Table grid listing */}
      <div className="table-wrap">
        <table className="workflow-table">
          <caption className="table-caption">Latest workflow executions fetched from the orchestrator API.</caption>
          <thead>
            <tr>
              <th>Instance ID</th>
              <th>Workflow Blueprint</th>
              <th>Execution Status</th>
              <th>Started On</th>
              <th>Operator Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((workflow) => (
              <tr key={workflow.id}>
                <td className="mono" style={{ color: 'var(--color-primary)', fontWeight: '600' }}>
                  {workflow.id.slice(0, 8)}...
                </td>
                <td style={{ fontWeight: '500' }}>
                  {workflow.workflow_name}
                </td>
                <td>
                  <span className={`status-badge ${workflow.status}`}>{workflow.status}</span>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>
                  {formatDate(workflow.created_at)}
                </td>
                <td>
                  <button type="button" className="action-btn secondary" style={{ padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.82rem' }} onClick={() => onViewWorkflow(workflow.id)}>
                    View details & DAG →
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading ? (
              <tr>
                <td colSpan={5} className="empty-row" style={{ padding: '3rem 0', color: 'var(--text-secondary)' }}>
                  <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📦</span>
                  No workflows found. Start a new order workflow preset to populate the dashboard!
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
