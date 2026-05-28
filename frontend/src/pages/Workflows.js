import { useEffect, useState } from 'react';
import '../index.css';

function Workflows() {
  const [workflows, setWorkflows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchWorkflows = async () => {
    const res = await fetch('/api/workflows');
    const data = await res.json();
    setWorkflows(data);
  };

  const fetchRuns = async () => {
    const res = await fetch('/api/runs');
    const data = await res.json();
    setRuns(data.reverse());
  };

  useEffect(() => {
    fetchWorkflows();
    fetchRuns();
    const id = setInterval(fetchRuns, 2000);
    return () => clearInterval(id);
  }, []);

  const start = async (id) => {
    setLoading(true);
    await fetch('/api/workflows/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflowId: id }) });
    await fetchRuns();
    setLoading(false);
  };

  return (
    <div className="container">
      <h1>Workflows</h1>

      <div className="card-grid">
        {workflows.map((wf) => (
          <div className="card" key={wf.id}>
            <h3>{wf.name}</h3>
            <p>{wf.description}</p>
            <button disabled={loading} onClick={() => start(wf.id)}>Start Workflow</button>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 30 }}>Recent Runs</h2>
      <div className="logs">
        {runs.length === 0 && <p>No runs yet</p>}
        {runs.map((r) => (
          <div key={r.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{r.id}</strong>
              <small>{r.status}</small>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 13 }}>
              {r.tasks.map((t) => (
                <div key={t.id}>{t.id}: {t.status}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Workflows;
