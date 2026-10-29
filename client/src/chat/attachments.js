// Client-side attachment checks. They mirror the server rules (server/src/config.js `attachments`
// and chat.controller.js) so problems are explained before uploading — the server still enforces
// every rule itself, so these checks are a convenience, never the security boundary.

// "10 MB or smaller": a file of exactly this many bytes is accepted.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_LABEL = '10 MB';

const VIDEO_EXT = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mpeg', 'mpg', 'm4v', '3gp', 'wmv', 'flv'];
const BLOCKED_EXT = new Set([
  ...VIDEO_EXT,
  'exe', 'dll', 'bat', 'cmd', 'ps1', 'sh', 'js', 'mjs', 'html', 'htm', 'svg', 'apk', 'jar', 'iso', 'com', 'scr',
]);

export const ATTACHMENT_MESSAGES = {
  empty: 'This file is empty. Please choose another file.',
  type: 'This file type is not allowed. Video and executable/script files are blocked.',
  network: 'Network error — the file was not sent. Check your connection and try again.',
};

// Returns { ok: true } or { ok: false, reason: 'too_large' | 'empty' | 'type', message? }.
export function checkAttachment(file) {
  if (!file) return { ok: false, reason: 'empty', message: ATTACHMENT_MESSAGES.empty };
  const size = Number(file.size) || 0;
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'too_large' };
  if (size === 0) return { ok: false, reason: 'empty', message: ATTACHMENT_MESSAGES.empty };
  const name = String(file.name || '');
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (String(file.type || '').startsWith('video/') || BLOCKED_EXT.has(ext)) {
    return { ok: false, reason: 'type', message: ATTACHMENT_MESSAGES.type };
  }
  return { ok: true };
}

// True only for the server's dedicated "too large" response (HTTP 413 + code), not other failures.
export const isTooLargeError = (err) => err?.code === 'ATTACHMENT_TOO_LARGE';

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace(/\.0$/, '')} MB`;
}
