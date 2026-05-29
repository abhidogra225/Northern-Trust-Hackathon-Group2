import { useEffect, useMemo, useState } from 'react';
import {
  getWorkflowById,
  pauseWorkflow,
  resumeWorkflow,
  retryTask,
  terminateWorkflow,
  getWorkflowEvents,
} from '../services/api';

const DEFAULT_COORDS = {
  'validate-order': { x: 50, y: 190 },
  'process-payment': { x: 280, y: 190 },
  'check-inventory': { x: 520, y: 90 },
  'check-fraud': { x: 520, y: 290 },
  'create-shipment': { x: 760, y: 190 },
  'send-notification-success': { x: 990, y: 190 },
  'update-order-status': { x: 1220, y: 190 },
  'send-notification-failure': { x: 400, y: 390 },
};

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString() + ' ' + new Date(value).toLocaleDateString();
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
  if (status === 'RETRYING') return '↺';
  if (status === 'MAX_RETRIES_EXCEEDED') return '⚠';
  if (status === 'PAUSED') return '‖';
  return '○';
}

export default function WorkflowDetail({ workflowId, onBack, onPollingStateChange }) {
  const [workflow, setWorkflow] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    let intervalId;

    async function load() {
      const wfRes = await getWorkflowById(workflowId);
      const evRes = await getWorkflowEvents(workflowId);

      if (!mounted) return;

      if (wfRes.error) {
        setError(wfRes.error);
        return;
      }

      setError('');
      setWorkflow(wfRes.data);
      if (evRes.data) {
        setEvents(evRes.data);
      }
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

  async function runControlAction(actionFn) {
    setActionLoading(true);
    setActionError('');
    const { error: apiError } = await actionFn();
    if (apiError) {
      setActionError(apiError);
    }
    setActionLoading(false);
  }

  // Find if workflow requires human approval
  const humanApprovalTask = useMemo(() => {
    return (workflow?.tasks || []).find(
      (t) => t.status === 'RUNNING' && t.output_data?.awaiting_approval
    );
  }, [workflow]);

  // Selected task inspector info
  const selectedTaskDetails = useMemo(() => {
    if (!selectedTaskId || !workflow) return null;
    // Get database instance
    const instance = (workflow.tasks || []).find((t) => t.task_id === selectedTaskId);
    // Get definition details
    const definition = (workflow.definition?.tasks || []).find((t) => t.id === selectedTaskId);
    
    return {
      taskId: selectedTaskId,
      name: definition?.name || selectedTaskId,
      serviceUrl: definition?.service_url || '-',
      status: instance ? instance.status : 'PENDING',
      startedAt: instance?.started_at,
      completedAt: instance?.completed_at,
      retryCount: instance?.retry_count || 0,
      errorMessage: instance?.error_message,
      outputData: instance?.output_data,
      inputData: instance?.input_data,
      instanceId: instance?.id,
    };
  }, [selectedTaskId, workflow]);

  // Topological / Coordinate layout computation
  const dagNodes = useMemo(() => {
    if (!workflow) return [];
    
    // Get all task definitions inside YAML
    const defTasks = workflow.definition?.tasks || [];
    
    // Convert to map
    return defTasks.map((t, idx) => {
      const instance = (workflow.tasks || []).find((x) => x.task_id === t.id);
      const coords = DEFAULT_COORDS[t.id] || { x: idx * 220 + 50, y: 190 };
      
      return {
        id: t.id,
        name: t.name,
        dependsOn: t.depends_on || [],
        onFailure: t.on_failure,
        status: instance ? instance.status : 'PENDING',
        retryCount: instance ? instance.retry_count : 0,
        x: coords.x,
        y: coords.y,
        instance,
      };
    });
  }, [workflow]);

  // SVG Connector Lines (Bezier) mapping
  const dagEdges = useMemo(() => {
    if (dagNodes.length === 0) return [];
    
    const edges = [];
    const nodeMap = {};
    dagNodes.forEach((n) => {
      nodeMap[n.id] = n;
    });

    dagNodes.forEach((node) => {
      // 1. Dependency parent arrows
      node.dependsOn.forEach((parentName) => {
        const parent = nodeMap[parentName];
        if (parent) {
          // Compute status to style the line
          let edgeStatus = 'pending';
          if (parent.status === 'COMPLETED') {
            edgeStatus = 'completed';
          }
          if (parent.status === 'RUNNING' && node.status === 'PENDING') {
            edgeStatus = 'active';
          }
          if (parent.status === 'FAILED') {
            edgeStatus = 'failed';
          }

          edges.push({
            id: `${parent.id}-${node.id}`,
            fromX: parent.x + 200, // right side of node
            fromY: parent.y + 40,  // center of node
            toX: node.x,          // left side of node
            toY: node.y + 40,      // center of node
            status: edgeStatus,
            type: 'dependency',
          });
        }
      });

      // 1.5 Success branch arrows (conditional success path)
      if (Array.isArray(node.instance?.output_data) || Array.isArray(node.onSuccess) || node.onSuccess) {
        // noop: backward compatibility guard
      }
      if (Array.isArray((workflow.definition?.tasks || []).find(t=>t.id===node.id)?.on_success)) {
        const succs = (workflow.definition?.tasks || []).find(t=>t.id===node.id).on_success || [];
        succs.forEach((succId) => {
          const target = nodeMap[succId];
          if (!target) return;
          let edgeStatus = 'pending';
          if (node.status === 'COMPLETED') edgeStatus = 'completed';
          if (node.status === 'RUNNING') edgeStatus = 'active';
          edges.push({
            id: `${node.id}-${target.id}-success`,
            fromX: node.x + 200,
            fromY: node.y + 40,
            toX: target.x,
            toY: target.y + 40,
            status: edgeStatus,
            type: 'success',
          });
        });
      }

      // 2. Failure fallback jump arrows (support array targets)
      const onFailureTargets = Array.isArray(node.onFailure) ? node.onFailure : (node.onFailure ? [node.onFailure] : []);
      onFailureTargets.forEach((failureTargetId) => {
        if (!failureTargetId || failureTargetId === 'fail_workflow') return;
        const failureTarget = nodeMap[failureTargetId];
        if (failureTarget) {
          edges.push({
            id: `${node.id}-${failureTarget.id}-failure`,
            fromX: node.x + 100,
            fromY: node.y + 80,
            toX: failureTarget.x,
            toY: failureTarget.y + 40,
            status: node.status === 'FAILED' ? 'failed' : 'pending',
            type: 'failure',
          });
        }
      });
    });

    return edges;
  }, [dagNodes]);

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
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', minHeight: '60vh' }}>
        <button type="button" className="link-btn" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          ← Back to workflows
        </button>
        <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
          <div className="spinner" style={{ width: '48px', height: '48px', border: '3px solid var(--border-muted)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          <p className="muted" style={{ fontSize: '0.95rem' }}>Loading workflow orchestration graph…</p>
          <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.25rem', opacity: 0.6 }}>Workflow ID: {workflowId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem', minHeight: '80vh' }}>
      
      {/* Left Column: DAG Graph + Details Inspector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button type="button" className="action-btn secondary" onClick={onBack}>
            ← Back
          </button>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem' }}>Workflow Orchestration Graph</h2>
            <p className="page-subtitle">Real-time dependency resolution and parallel worker orchestration pipeline.</p>
          </div>
        </div>

        {/* Human Approval Alert Notice Banner */}
        {humanApprovalTask ? (
          <div className="banner" style={{ background: 'var(--color-warning-glow)', borderColor: 'rgba(245,158,11,0.4)', color: '#fde68a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '700', fontSize: '1.05rem' }}>
              <span>⚠️ Awaiting Manual Operator Release</span>
            </div>
            <p style={{ fontSize: '0.88rem', margin: '0.25rem 0' }}>
              Order payment amount of <strong>${workflow?.input_data?.amount}</strong> exceeds the automated threshold limit ($10,000). The orchestrator has safely paused execution.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="action-btn"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                disabled={actionLoading}
                onClick={() => runControlAction(() => resumeWorkflow(workflow.id))}
              >
                Approve & Release Payment →
              </button>
              <button
                type="button"
                className="action-btn danger"
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                disabled={actionLoading}
                onClick={() => runControlAction(() => terminateWorkflow(workflow.id))}
              >
                Reject Order
              </button>
            </div>
          </div>
        ) : null}

        {/* Real interactive SVG DAG Graph Canvas */}
        <div className="dag-container-outer">
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ width: 12, height: 12, background: 'var(--color-success)', borderRadius: 4, display: 'inline-block' }} />
              <small style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>Success Path</small>
            </div>
            <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ width: 12, height: 12, background: 'var(--color-failed)', borderRadius: 4, display: 'inline-block' }} />
              <small style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>Failure Path</small>
            </div>
          </div>
          <div className="dag-grid-bg" />
          <div className="dag-canvas">
            
            {/* SVG Connections overlay layer */}
            <svg className="dag-svg-overlay">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
                </marker>
                <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
                </marker>
                <marker id="arrow-success" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-success)" />
                </marker>
                <marker id="arrow-failed" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-failed)" />
                </marker>
              </defs>

              {dagEdges.map((edge) => {
                // Bezier Curve points calculation
                const cX1 = (edge.fromX + edge.toX) / 2;
                const cY1 = edge.fromY;
                const cX2 = (edge.fromX + edge.toX) / 2;
                const cY2 = edge.toY;
                const dPath = `M ${edge.fromX} ${edge.fromY} C ${cX1} ${cY1}, ${cX2} ${cY2}, ${edge.toX} ${edge.toY}`;
                
                // Style properties
                let colorClass = 'dag-connector-line';
                let markerId = 'arrow';
                if (edge.status === 'completed') {
                  colorClass += ' completed';
                  markerId = 'arrow-success';
                }
                if (edge.status === 'active') {
                  colorClass += ' active';
                  markerId = 'arrow-active';
                }
                if (edge.status === 'failed') {
                  colorClass += ' failed';
                  markerId = 'arrow-failed';
                }

                // If failure path edge, set custom styling
                const isFailurePath = edge.type === 'failure';

                return (
                  <path
                    key={edge.id}
                    d={dPath}
                    className={colorClass}
                    markerEnd={`url(#${markerId})`}
                    style={{
                      strokeDasharray: isFailurePath ? '5 5' : undefined,
                      stroke: isFailurePath ? '#f43f5e' : undefined,
                    }}
                  />
                );
              })}
            </svg>

            {/* Absolute positioned interactive Glassmorphic DAG Nodes */}
            {dagNodes.map((node) => (
              <div
                key={node.id}
                className="dag-node-wrapper"
                style={{ left: `${node.x}px`, top: `${node.y}px` }}
                onClick={() => setSelectedTaskId(node.id)}
              >
                <div className={`dag-node ${node.status}`}>
                  <div className="dag-node-title" title={node.name}>
                    {node.name}
                  </div>
                  <div className="dag-node-sub">{node.id}</div>
                  <div className="dag-node-footer">
                    <span className={`status-badge ${node.status}`} style={{ fontSize: '0.62rem', padding: '0.2rem 0.4rem', minWidth: 'auto' }}>
                      {statusIcon(node.status)} {node.status}
                    </span>
                    {node.retryCount > 0 ? (
                      <span style={{ color: 'var(--color-warning)', fontWeight: '600', fontSize: '0.75rem' }}>
                        ↺ {node.retryCount}
                      </span>
                    ) : null}
                    {node.status === 'RETRYING' ? (
                      <div style={{ marginLeft: '0.5rem', color: 'var(--color-warning)', fontSize: '0.75rem', fontWeight: 700 }}>
                        Retrying...
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

          </div>
        </div>

        {/* Selected Task details drawer inspector */}
        {selectedTaskDetails ? (
          <div className="task-details-overlay">
            <div className="task-details-header">
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: '#fff' }}>
                  Inspector: {selectedTaskDetails.name}
                </h3>
                <p className="dag-node-sub" style={{ fontSize: '0.78rem' }}>Task ID: {selectedTaskDetails.taskId}</p>
              </div>
              <span className={`status-badge ${selectedTaskDetails.status}`}>
                {statusIcon(selectedTaskDetails.status)} {selectedTaskDetails.status}
              </span>
            </div>

            <div className="task-details-grid">
              <div>
                <p className="detail-label">Downstream service url</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }} className="mono">{selectedTaskDetails.serviceUrl}</p>
              </div>
              <div>
                <p className="detail-label">Started / Duration</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  {formatDate(selectedTaskDetails.startedAt)} ({getDuration(selectedTaskDetails.startedAt, selectedTaskDetails.completedAt)})
                </p>
              </div>
              <div>
                <p className="detail-label">Retries captured</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '600' }}>
                  {selectedTaskDetails.retryCount} attempts
                </p>
              </div>
              {selectedTaskDetails.errorMessage ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <p className="detail-label" style={{ color: 'var(--color-failed)' }}>Permanent error message</p>
                  <p className="error-text" style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                    {selectedTaskDetails.errorMessage}
                  </p>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div>
                <p className="detail-label">Task inputs payload</p>
                <pre className="json-block compact">{JSON.stringify(selectedTaskDetails.inputData || {}, null, 2)}</pre>
              </div>
              <div>
                <p className="detail-label">Task outputs response</p>
                <pre className="json-block compact">{JSON.stringify(selectedTaskDetails.outputData || {}, null, 2)}</pre>
              </div>
            </div>

            {selectedTaskDetails.status === 'FAILED' ? (
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => runControlAction(() => retryTask(selectedTaskDetails.instanceId))}
                  disabled={actionLoading}
                >
                  ↺ Manually retry failed task
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted" style={{ textAlign: 'center', background: 'rgba(255,255,255,0.01)', padding: '1rem', border: '1px dashed var(--border-muted)', borderRadius: '12px' }}>
            💡 Click on any DAG node to inspect its runtime payloads, task logs, retries, and errors.
          </p>
        )}

      </div>

      {/* Right Column: Workflow Control Actions + Audit Timeline */}
      <div style={{ borderLeft: '1px solid var(--border-muted)', paddingLeft: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Workflow Overview header */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Workflow status</span>
            <span className={`status-badge ${workflow.status}`}>{workflow.status}</span>
          </div>
          <p className="detail-label">Workflow instance id</p>
          <p className="mono" style={{ fontSize: '0.78rem', wordBreak: 'break-all', marginBottom: '0.85rem', color: '#fff' }}>{workflow.id}</p>
          
          <div style={{ borderTop: '1px solid var(--border-muted)', paddingTop: '0.75rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span className="muted">Total tasks:</span>
              <span style={{ fontWeight: '600' }}>{workflow.tasks?.length || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span className="muted">Succeeded:</span>
              <span style={{ color: 'var(--color-success)', fontWeight: '600' }}>
                {workflow.tasks?.filter((t) => t.status === 'COMPLETED').length || 0}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">Failed:</span>
              <span style={{ color: 'var(--color-failed)', fontWeight: '600' }}>
                {workflow.tasks?.filter((t) => t.status === 'FAILED').length || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Runtime operator controls */}
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '0.75rem' }}>Operator Controls</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            
            {workflow.status === 'RUNNING' ? (
              <button
                type="button"
                className="action-btn secondary"
                style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
                disabled={actionLoading}
                onClick={() => runControlAction(() => pauseWorkflow(workflow.id))}
              >
                ‖ Pause execution
              </button>
            ) : null}

            {workflow.status === 'PAUSED' ? (
              <button
                type="button"
                className="action-btn"
                style={{ width: '100%', display: 'flex', justifyContent: 'center', background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 12px rgba(16,185,129,0.2)' }}
                disabled={actionLoading}
                onClick={() => runControlAction(() => resumeWorkflow(workflow.id))}
              >
                ✓ {humanApprovalTask ? 'Approve & Release Order' : 'Resume execution'}
              </button>
            ) : null}

            {['RUNNING', 'PAUSED'].includes(workflow.status) ? (
              <button
                type="button"
                className="action-btn danger"
                style={{ width: '100%' }}
                disabled={actionLoading}
                onClick={() => {
                  const confirmTerminate = window.confirm('Terminate this workflow?');
                  if (!confirmTerminate) return;
                  runControlAction(() => terminateWorkflow(workflow.id));
                }}
              >
                ✕ Terminate workflow
              </button>
            ) : null}

          </div>
          {actionError ? <div className="banner error" style={{ fontSize: '0.8rem', padding: '0.5rem', marginTop: '0.5rem' }}>{actionError}</div> : null}
        </div>

        {/* Audit trail vertical timeline */}
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '0.25rem' }}>Audit Trail</h3>
          <p className="page-subtitle" style={{ fontSize: '0.78rem', marginBottom: '1rem' }}>Chronological ledger of orchestration events.</p>
          
            <div className="audit-timeline" style={{ maxHeight: '350px', overflowY: 'auto' }}>
            {events.map((ev) => (
              <div key={ev.id} className={`audit-event-node ${ev.event_type}`}>
                <span className="audit-event-time">{new Date(ev.created_at).toLocaleTimeString()}</span>
                <span className="audit-event-text">
                  {ev.event_type.replace('_', ' ')}
                  {ev.task_id ? <strong style={{ color: 'var(--color-primary)', marginLeft: '0.25rem', fontFamily: 'var(--font-mono)' }}>[{ev.task_id}]</strong> : null}
                </span>
                {ev.message ? (
                  <span className="audit-event-msg" title={ev.message}>
                    {ev.message.length > 80 ? ev.message.slice(0, 80) + '...' : ev.message}
                  </span>
                ) : null}
                <div style={{ marginLeft: 'auto' }}>
                  <span className="status-badge" style={{ background: 'rgba(13,92,70,0.06)', color: 'var(--color-primary)', fontSize: '0.65rem' }}>Event Published</span>
                </div>
              </div>
            ))}
            {events.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.8rem' }}>No system events recorded yet.</p>
            ) : null}
          </div>
        </div>

      </div>

    </div>
  );
}
