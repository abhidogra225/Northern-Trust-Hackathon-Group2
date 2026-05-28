import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import OrderPage from "./pages/OrderPage";
import StatusPage from "./pages/StatusPage";
import LogsPage from "./pages/LogsPage";
import Workflows from "./pages/Workflows";

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/workflows" element={<Workflows />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;