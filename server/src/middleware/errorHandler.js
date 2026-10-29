import { config } from '../config.js';

// 404 for unknown API routes.
export function notFound(req, res) {
  res.status(404).json({ ok: false, message: 'Not found.' });
}

// One response shape for every "attachment too large" case (declared size, streamed body, controller
// re-check) so the client can show its attachment-size dialog for exactly this error and nothing else.
export function attachmentTooLarge(res) {
  return res.status(413).json({
    ok: false,
    code: 'ATTACHMENT_TOO_LARGE',
    maxBytes: config.attachments.maxBytes,
    message: 'Attachments must be 10 MB or smaller.',
  });
}

// Central error handler — never leaks stack traces or DB details to the client.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err?.type === 'entity.too.large') {
    if (/\/attachments(\?|$)/.test(req.originalUrl || '')) return attachmentTooLarge(res);
    return res.status(413).json({ ok: false, message: 'Request is too large.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, message: 'Invalid JSON body.' });
  }
  console.error('[error]', err?.code || '', err?.message || err);
  return res.status(500).json({ ok: false, message: 'Something went wrong. Please try again later.' });
}
