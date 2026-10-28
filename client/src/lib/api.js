// Small fetch wrapper for the Express API (VITE_API_BASE in production, Vite proxy in development).
export const API_BASE = import.meta.env.VITE_API_BASE || '';

export class ApiError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, token, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'Network error — check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new ApiError(res.status, data.message || `Request failed (${res.status}).`, data);
  }
  return data;
}

// Session tokens live in localStorage (strict CSP: script-src 'self'). Wrapped for private mode.
export const tokenStore = {
  get(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: session lasts for this tab only */
    }
  },
  clear(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const VISITOR_TOKEN_KEY = 'sn-chat-session';
export const ADMIN_TOKEN_KEY = 'sn-admin-session';
export const CHAT_DRAFT_KEY = 'sn-chat-draft';
