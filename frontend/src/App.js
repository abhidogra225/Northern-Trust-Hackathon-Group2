import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import LogsPage from './pages/LogsPage';
import OrderPage from './pages/OrderPage';
import StatusPage from './pages/StatusPage';
import Workflows from './pages/Workflows';
import './App.css'; // <-- Links the live compiled Tailwind output

function App() {
  return (
    <Router>
      <div className="bg-slate-950 min-h-screen text-slate-100 flex flex-col font-sans">
        {/* Navigation Bar present across all pages */}
        <Navbar />
        
        {/* Main Application Content Area */}
        <main className="flex-grow">
          <Routes>
            {/* Main Visualizer Panel */}
            <Route path="/dashboard" element={<Dashboard />} />
            
            {/* Placeholder routes matching your team's pages */}
            <Route path="/orders" element={<OrderPage />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/logs" element={<LogsPage />} />

            {/* Default Route: Redirect straight to the visual orchestrator console */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;