import "../index.css";

function StatusPage() {
  const steps = [
    { name: "Inventory Check", status: "green" },
    { name: "Payment Processing", status: "yellow" },
    { name: "Shipping", status: "red" }
  ];

  return (
    <div className="container">
      <h1>Status</h1>

      {steps.map((step, i) => (
        <div className="status-box" key={i}>
          <span>{step.name}</span>
          <span className={step.status}>
            {step.status.toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  );
}

export default StatusPage;