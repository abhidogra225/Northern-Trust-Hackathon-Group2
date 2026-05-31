import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getWorkflowById,
  pauseWorkflow,
  resumeWorkflow,
  retryTask,
  terminateWorkflow,
  getWorkflowEvents,
} from '../services/api';

/** Logical DAG canvas size — scaled to fit the viewport via CSS transform. */
const DAG_DESIGN_WIDTH = 1270;
const DAG_DESIGN_HEIGHT = 410;
const DAG_NODE_WIDTH = 180;
const DAG_NODE_HEIGHT = 80;

const DEFAULT_COORDS = {
  'validate-order': { x: 20, y: 160 },
  'process-payment': { x: 230, y: 160 },
  'check-inventory': { x: 440, y: 70 },
  'check-fraud': { x: 440, y: 250 },
  'create-shipment': { x: 650, y: 160 },
  'send-notification-success': { x: 860, y: 160 },
  'update-order-status': { x: 1070, y: 160 },
  'send-notification-failure': { x: 230, y: 320 },
};

function dagNodeCenterY(y) {
  return y + DAG_NODE_HEIGHT / 2;
}

/** Fallback when API omits workflow.definition (order-flow). */
const FALLBACK_ORDER_FLOW_TASKS = [
  { id: 'validate-order', name: 'Validate Order', depends_on: [], on_failure: 'send-notification-failure' },
  { id: 'process-payment', name: 'Process Payment', depends_on: ['validate-order'], on_failure: 'send-notification-failure' },
  { id: 'check-inventory', name: 'Check Inventory', depends_on: ['process-payment'], on_failure: 'fail_workflow' },
  { id: 'check-fraud', name: 'Check Fraud', depends_on: ['process-payment'], on_failure: 'fail_workflow' },
  { id: 'create-shipment', name: 'Create Shipment', depends_on: ['check-inventory', 'check-fraud'], on_failure: 'fail_workflow' },
  { id: 'send-notification-success', name: 'Send Success Notification', depends_on: ['create-shipment'], on_failure: 'fail_workflow' },
  { id: 'send-notification-failure', name: 'Send Failure Notification', depends_on: [], on_failure: 'fail_workflow' },
  { id: 'update-order-status', name: 'Update Order Status', depends_on: ['send-notification-success'], on_failure: 'fail_workflow' },
];

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
  if (status === 'SKIPPED') return '⊘';
  return '○';
}

const SUCCESS_PATH_TASK_IDS = new Set([
  'check-inventory',
  'check-fraud',
  'create-shipment',
  'send-notification-success',
  'update-order-status',
]);

function isDepTerminalFailure(depId, instances) {
  const dep = instances.find((t) => t.task_id === depId);
  if (!dep) return false;
  return dep.status === 'FAILED' || dep.status === 'MAX_RETRIES_EXCEEDED';
}

function depsAllCompleted(deps, instances) {
  return (deps || []).every((depId) => {
    const dep = instances.find((t) => t.task_id === depId);
    return dep?.status === 'COMPLETED';
  });
}

/** Map DB task status to what the DAG should show (skipped branches, approval pause, etc.). */
function getDagDisplayStatus(taskId, instance, workflow, defTask, allInstances) {
  const raw = instance?.status || 'PENDING';
  const deps = defTask?.depends_on || [];

  if (instance?.output_data?.awaiting_approval) return 'PAUSED';
  if (workflow?.status === 'PAUSED' && raw === 'RUNNING' && taskId === 'process-payment') return 'PAUSED';

  if (raw === 'SKIPPED') return 'SKIPPED';
  if (raw === 'MAX_RETRIES_EXCEEDED') return 'FAILED';

  const failureNotifier = allInstances.find((t) => t.task_id === 'send-notification-failure');
  const failureBranchRan =
    failureNotifier?.status === 'COMPLETED' ||
    (failureNotifier?.status === 'RUNNING' && failureNotifier?.started_at);

  if (SUCCESS_PATH_TASK_IDS.has(taskId) && failureBranchRan && raw === 'PENDING' && !instance?.started_at) {
    return 'SKIPPED';
  }

  if (raw === 'PENDING' && !instance?.started_at) {
    if (deps.some((depId) => isDepTerminalFailure(depId, allInstances))) return 'SKIPPED';
    if (['FAILED', 'COMPLETED', 'TERMINATED'].includes(workflow?.status) && !depsAllCompleted(deps, allInstances)) {
      return 'SKIPPED';
    }
  }

  if (taskId === 'send-notification-failure' && workflow?.status === 'COMPLETED' && raw === 'SKIPPED') {
    return 'SKIPPED';
  }

  if (
    (taskId === 'send-notification-success' || taskId === 'update-order-status') &&
    workflow?.status === 'FAILED' &&
    raw === 'PENDING' &&
    !instance?.started_at
  ) {
    return 'SKIPPED';
  }

  return raw;
}

export default function WorkflowDetail({ workflowId, onBack, onPollingStateChange }) {
  const [workflow, setWorkflow] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [dagScale, setDagScale] = useState(1);
  const dagViewportRef = useRef(null);

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

  useEffect(() => {
    const el = dagViewportRef.current;
    if (!el) return undefined;

    const updateScale = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      // Keep graph highly visible and prominent with a minimum scale factor of 0.9 to prevent excessive scroll while keeping it large
      const scale = Math.max(0.9, Math.min(w / DAG_DESIGN_WIDTH, h / DAG_DESIGN_HEIGHT, 1.45));
      setDagScale(scale);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [workflow]);

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
    
    const defTask =
      (workflow.definition?.tasks || FALLBACK_ORDER_FLOW_TASKS).find((t) => t.id === selectedTaskId) ||
      { depends_on: [] };
    const displayStatus = getDagDisplayStatus(
      selectedTaskId,
      instance,
      workflow,
      defTask,
      workflow.tasks || []
    );

    return {
      taskId: selectedTaskId,
      name: definition?.name || selectedTaskId,
      serviceUrl: definition?.service_url || '-',
      status: displayStatus,
      rawStatus: instance ? instance.status : 'PENDING',
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

    const defTasks =
      workflow.definition?.tasks?.length > 0
        ? workflow.definition.tasks
        : workflow.workflow_name === 'order-flow'
          ? FALLBACK_ORDER_FLOW_TASKS
          : (workflow.tasks || []).map((t) => ({
              id: t.task_id,
              name: t.task_id,
              depends_on: [],
              on_failure: 'fail_workflow',
            }));

    const instances = workflow.tasks || [];

    return defTasks.map((t, idx) => {
      const instance = instances.find((x) => x.task_id === t.id);
      const coords = DEFAULT_COORDS[t.id] || { x: idx * 140 + 8, y: 100 };
      const rawStatus = instance ? instance.status : 'PENDING';
      const displayStatus = getDagDisplayStatus(t.id, instance, workflow, t, instances);

      return {
        id: t.id,
        name: t.name,
        dependsOn: t.depends_on || [],
        onFailure: t.on_failure,
        status: displayStatus,
        rawStatus,
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
          if (parent.status === 'FAILED' || parent.status === 'SKIPPED') {
            edgeStatus = parent.status === 'FAILED' ? 'failed' : 'pending';
          }
          if (node.status === 'SKIPPED') {
            edgeStatus = 'pending';
          }

          edges.push({
            id: `${parent.id}-${node.id}`,
            fromX: parent.x + DAG_NODE_WIDTH,
            fromY: dagNodeCenterY(parent.y),
            toX: node.x,
            toY: dagNodeCenterY(node.y),
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
            fromX: node.x + DAG_NODE_WIDTH,
            fromY: dagNodeCenterY(node.y),
            toX: target.x,
            toY: dagNodeCenterY(target.y),
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
            fromX: node.x + DAG_NODE_WIDTH / 2,
            fromY: node.y + DAG_NODE_HEIGHT,
            toX: failureTarget.x + DAG_NODE_WIDTH / 2,
            toY: failureTarget.y,
            status:
              node.status === 'FAILED' || node.rawStatus === 'MAX_RETRIES_EXCEEDED'
                ? 'failed'
                : node.status === 'COMPLETED' && failureTarget.status === 'COMPLETED'
                  ? 'failed'
                  : 'pending',
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

  const scaledW = DAG_DESIGN_WIDTH * dagScale;
  const scaledH = DAG_DESIGN_HEIGHT * dagScale;

  return (
    <div className="page workflow-detail-page">
      <div className="workflow-detail-main">
        <div className="workflow-detail-header">
          <button type="button" className="action-btn secondary workflow-back-btn" onClick={onBack}>
            ← Back
          </button>
          <div className="workflow-detail-title">
            <h2>Workflow graph</h2>
            <p className="page-subtitle">Live task status across the order pipeline</p>
          </div>
          <span className={`status-badge ${workflow.status} workflow-header-status`}>{workflow.status}</span>
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

        <div className="dag-container-outer">
          <div className="dag-legend">
            <span className="dag-legend-item">
              <span className="dag-legend-swatch success" /> Success
            </span>
            <span className="dag-legend-item">
              <span className="dag-legend-swatch failed" /> Failure
            </span>
          </div>
          <div className="dag-viewport" ref={dagViewportRef}>
            <div className="dag-scaled-box" style={{ width: scaledW, height: scaledH }}>
              <div
                className="dag-stage"
                style={{
                  width: DAG_DESIGN_WIDTH,
                  height: DAG_DESIGN_HEIGHT,
                  transform: `scale(${dagScale})`,
                }}
              >
                <div className="dag-grid-bg" />
                <svg
                  className="dag-svg-overlay"
                  width={DAG_DESIGN_WIDTH}
                  height={DAG_DESIGN_HEIGHT}
                  viewBox={`0 0 ${DAG_DESIGN_WIDTH} ${DAG_DESIGN_HEIGHT}`}
                >
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

                {dagNodes.length === 0 ? (
                  <div className="dag-empty-msg">No workflow definition available to render the DAG graph.</div>
                ) : null}

                {dagNodes.map((node) => (
                  <div
                    key={node.id}
                    className={`dag-node-wrapper ${selectedTaskId === node.id ? 'selected' : ''}`}
                    style={{ left: `${node.x}px`, top: `${node.y}px`, width: DAG_NODE_WIDTH }}
                    onClick={() => setSelectedTaskId(node.id)}
                  >
                    <div className={`dag-node ${node.status}`}>
                      <div className="dag-node-title" title={node.name}>
                        {node.name}
                      </div>
                      <div className="dag-node-footer">
                        <span className={`status-badge ${node.status} dag-node-badge`}>
                          {statusIcon(node.status)} {node.status}
                        </span>
                        {node.retryCount > 0 ? (
                          <span className="dag-retry-count">↺ {node.retryCount}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="dag-hint muted">Click any node in the graph to inspect task inputs/outputs ↓</p>
        </div>

        {selectedTaskDetails ? (
          <div className="task-details-card">
            <div className="task-details-card-header">
              <div className="title-area">
                <h3>{selectedTaskDetails.name}</h3>
                <span className="mono subtitle">{selectedTaskDetails.taskId}</span>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setSelectedTaskId(null)}
                aria-label="Close inspector"
              >
                ✕
              </button>
            </div>

            <div className="task-details-card-body">
              <div className="meta-column">
                <div className="meta-row">
                  <span className="label">Status</span>
                  <span className={`status-badge ${selectedTaskDetails.status}`}>
                    {statusIcon(selectedTaskDetails.status)} {selectedTaskDetails.status}
                  </span>
                </div>
                
                <div className="meta-row-grid">
                  <div>
                    <span className="label">Duration</span>
                    <span className="val">{getDuration(selectedTaskDetails.startedAt, selectedTaskDetails.completedAt)}</span>
                  </div>
                  <div>
                    <span className="label">Retries</span>
                    <span className="val">{selectedTaskDetails.retryCount}</span>
                  </div>
                </div>

                {selectedTaskDetails.errorMessage ? (
                  <div className="error-box">
                    <span className="label">Error</span>
                    <span className="error-text">{selectedTaskDetails.errorMessage}</span>
                  </div>
                ) : null}

                {(selectedTaskDetails.status === 'FAILED' || selectedTaskDetails.rawStatus === 'MAX_RETRIES_EXCEEDED') ? (
                  <button
                    type="button"
                    className="action-btn retry-btn"
                    onClick={() => runControlAction(() => retryTask(selectedTaskDetails.instanceId))}
                    disabled={actionLoading}
                  >
                    ↺ Retry task
                  </button>
                ) : null}
              </div>

              <div className="payload-column">
                <div className="payload-grids">
                  <div className="payload-block">
                    <span className="label">Input Data</span>
                    <pre className="json-block task-json-preview">
                      {JSON.stringify(selectedTaskDetails.inputData || {}, null, 2)}
                    </pre>
                  </div>
                  <div className="payload-block">
                    <span className="label">Output Data</span>
                    <pre className="json-block task-json-preview">
                      {JSON.stringify(selectedTaskDetails.outputData || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="workflow-detail-aside">

        <div className="card workflow-status-card">
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
                {workflow.tasks?.filter((t) => t.status === 'FAILED' || t.status === 'MAX_RETRIES_EXCEEDED').length || 0}
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
          
            <div className="audit-timeline audit-timeline-compact">
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

      </aside>
    </div>
  );
}
