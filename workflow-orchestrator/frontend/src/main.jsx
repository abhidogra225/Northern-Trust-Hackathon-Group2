import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: '#ffb5b5', background: '#0f0f0f', minHeight: '100vh' }}>
          <h1>Dashboard failed to load</h1>
          <pre style={{ color: '#f1f1f1', whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <p>Ensure the orchestrator API is running on http://localhost:3000</p>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
