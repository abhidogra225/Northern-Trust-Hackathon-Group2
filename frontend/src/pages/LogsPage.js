import "../index.css";

function LogsPage() {
  return (
    <div className="container">
      <h1>Logs</h1>

      <div className="logs">
        <p>[INFO] Order started</p>
        <p>[INFO] Inventory checked</p>
        <p>[ERROR] Payment failed</p>
      </div>
    </div>
  );
}

export default LogsPage;