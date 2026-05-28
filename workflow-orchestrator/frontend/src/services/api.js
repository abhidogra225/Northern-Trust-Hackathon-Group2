const API_BASE_URL = 'http://localhost:3000/api';

async function request(path, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });

    const json = await response.json();
    if (!response.ok || json.success === false) {
      return { data: null, error: json.error || `Request failed with status ${response.status}` };
    }

    return { data: json.data, error: null };
  } catch (error) {
    return { data: null, error: error.message || 'Network error' };
  }
}

export function startWorkflow(inputData) {
  return request('/workflows/start', {
    method: 'POST',
    body: JSON.stringify({ workflowName: 'order-flow', inputData }),
  });
}

export function getWorkflows({ page = 1, limit = 10, status = '' } = {}) {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (status) {
    query.set('status', status);
  }

  return request(`/workflows?${query.toString()}`);
}

export function getWorkflowById(workflowId) {
  return request(`/workflows/${workflowId}`);
}

export function pauseWorkflow(workflowId) {
  return request(`/workflows/${workflowId}/pause`, { method: 'POST' });
}

export function resumeWorkflow(workflowId) {
  return request(`/workflows/${workflowId}/resume`, { method: 'POST' });
}

export function terminateWorkflow(workflowId) {
  return request(`/workflows/${workflowId}/terminate`, { method: 'POST' });
}

export function retryTask(taskId) {
  return request(`/tasks/${taskId}/retry`, { method: 'POST' });
}
