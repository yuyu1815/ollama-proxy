/**
 * API Client
 * HTTP communication abstraction
 */

const API_BASE = '';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(text || `HTTP ${res.status}`, res.status);
  }

  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return res.json();
  }

  return res.text();
}

export const api = {
  get: (url) => request(url, { method: 'GET' }),

  post: (url, data) =>
    request(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: (url, data) =>
    request(url, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: (url) => request(url, { method: 'DELETE' }),
};
