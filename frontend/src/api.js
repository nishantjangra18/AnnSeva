const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function getToken() {
  return localStorage.getItem('annseva_token');
}

export function setSession(session) {
  localStorage.setItem('annseva_token', session.token);
  localStorage.setItem('annseva_user', JSON.stringify(session.user));
}

export function clearSession() {
  localStorage.removeItem('annseva_token');
  localStorage.removeItem('annseva_user');
}

export function storedUser() {
  const raw = localStorage.getItem('annseva_user');
  return raw ? JSON.parse(raw) : null;
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export { API_URL };
