import "../index.css";

function Dashboard() {
  const services = [
    "Product Service",
    "Inventory Service",
    "Order Service",
    "Payment Service",
    "Shipping Service",
  ];

  return (
    <div className="container">
      <h1>Home</h1>

      <div className="card-grid">
        {services.map((service, i) => (
          <div className="card" key={i}>
            <h3>{service}</h3>
            <p className="green">Running ✅</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;