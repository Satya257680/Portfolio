// Formatting helpers for the chat UI.

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function timeOf(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?(am|pm)$/i, (m) => m.toUpperCase());
}

// Sidebar timestamp: time today, "Yesterday", weekday within a week, else a short date.
export function listTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (sameDay(d, now)) return timeOf(d);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  if (now - d < 6 * 86400000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Date separator label inside a conversation.
export function dayLabel(value) {
  const d = new Date(value);
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function initials(name = '') {
  const parts = String(name)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

const tones = [
  ['#6aa8ff', '#3b6cf6'],
  ['#c084fc', '#7c3aed'],
  ['#f9a8d4', '#db2777'],
  ['#5eead4', '#0d9488'],
  ['#fcd34d', '#d97706'],
  ['#a5b4fc', '#4f46e5'],
  ['#86efac', '#16a34a'],
  ['#fdba74', '#ea580c'],
];
export function toneFor(id) {
  const t = tones[Math.abs(Number(id) || 0) % tones.length];
  return { background: `linear-gradient(135deg, ${t[0]}, ${t[1]})` };
}
const nameTones = ['#7dd3fc', '#fca5a5', '#fcd34d', '#86efac', '#c4b5fd', '#f9a8d4', '#5eead4', '#fdba74'];
export const nameColor = (id) => nameTones[Math.abs(Number(id) || 0) % nameTones.length];

export function clientId() {
  const rnd =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `c_${rnd}`.slice(0, 40);
}

// Merge message arrays by id (server) / clientMessageId (pending), sorted chronologically.
export function mergeMessages(current = [], incoming = []) {
  const byKey = new Map();
  for (const m of current) byKey.set(m.id ? `id:${m.id}` : `c:${m.clientMessageId}`, m);
  for (const m of incoming) {
    if (m.clientMessageId) byKey.delete(`c:${m.clientMessageId}`);
    byKey.set(`id:${m.id}`, m);
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.id && b.id) return a.id - b.id;
    if (a.id) return -1;
    if (b.id) return 1;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

export const EMOJIS = ['😀', '😂', '😊', '😍', '🙏', '👍', '👋', '🎉', '🔥', '🚀', '💡', '✅', '🤝', '😅', '🤔', '😎', '❤️', '👏', '💻', '📌', '⭐', '🙌', '😄', '👀'];
