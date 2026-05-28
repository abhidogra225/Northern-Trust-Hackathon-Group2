import { Link } from "react-router-dom";
import "../index.css";

function Navbar() {
  return (
    <div className="navbar">
      <h2>E-Commerce Workflow</h2>
      <div className="navbar-links">
        <Link to="/">Home</Link>
        <Link to="/order">Order</Link>
        <Link to="/status">Status</Link>
        <Link to="/logs">Logs</Link>
        <Link to="/workflows">Workflows</Link>
      </div>
    </div>
  );
}

export default Navbar;