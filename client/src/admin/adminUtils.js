// Small formatting / download helpers for the admin panel.
import { API_BASE } from '../lib/api.js';

export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const fmtNum = (n) => Number(n || 0).toLocaleString();

// "5 min ago", "3 h ago", "Yesterday", else a date.
export function relTime(v) {
  if (!v) return 'Never';
  const d = new Date(v);
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return '—';
  if (diff < 60e3) return 'Just now';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} min ago`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} h ago`;
  if (diff < 2 * 86400e3) return 'Yesterday';
  return fmtDate(d);
}

// Authenticated file download (the token is sent as a header, never placed in a URL).
export async function downloadFile(path, token, fallbackName) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data.message || `Download failed (${res.status}).`), { status: res.status });
  }
  const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
