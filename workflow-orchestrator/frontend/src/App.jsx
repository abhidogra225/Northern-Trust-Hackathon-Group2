import { useCallback, useMemo, useState } from 'react';
import WorkflowList from './pages/WorkflowList';
import WorkflowDetail from './pages/WorkflowDetail';
import StartWorkflow from './pages/StartWorkflow';

export default function App() {
  const [activePage, setActivePage] = useState('workflows');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [pollingCount, setPollingCount] = useState(0);

  const isPollingActive = pollingCount > 0;

  const handlePollingStateChange = useCallback((active) => {
    setPollingCount((count) => {
      if (active) return count + 1;
      return Math.max(0, count - 1);
    });
  }, []);

  const openWorkflowDetail = useCallback((workflowId) => {
    setSelectedWorkflowId(workflowId);
    setActivePage('workflowDetail');
  }, []);

  const content = useMemo(() => {
    if (activePage === 'start') {
      return <StartWorkflow onOpenWorkflow={openWorkflowDetail} />;
    }

    if (activePage === 'workflowDetail' && selectedWorkflowId) {
      return (
        <WorkflowDetail
          workflowId={selectedWorkflowId}
          onBack={() => setActivePage('workflows')}
          onPollingStateChange={handlePollingStateChange}
        />
      );
    }

    return <WorkflowList onViewWorkflow={openWorkflowDetail} onPollingStateChange={handlePollingStateChange} />;
  }, [activePage, handlePollingStateChange, openWorkflowDetail, selectedWorkflowId]);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">O</div>
          <div>
            <h1>Orchestrator</h1>
            <p className="brand-tag">E-commerce workflow dashboard</p>
          </div>
        </div>

        <nav className="nav-menu">
          <button
            type="button"
            className={`nav-btn ${activePage === 'workflows' ? 'active' : ''}`}
            onClick={() => setActivePage('workflows')}
          >
            Workflows
          </button>
          <button
            type="button"
            className={`nav-btn ${activePage === 'start' ? 'active' : ''}`}
            onClick={() => setActivePage('start')}
          >
            Start New Order
          </button>
        </nav>
      </aside>

      <main className="main-area">
        <header className="top-bar">
          <div>
            <p className="top-note">Monitor workflows, inspect order states, and control execution in one place.</p>
          </div>
          <span className={`live-indicator ${isPollingActive ? 'active' : ''}`}>
            <span className="dot" />
            Live updates
          </span>
        </header>
        {content}
      </main>
    </div>
  );
}
