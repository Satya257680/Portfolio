// 404 for unknown API routes.
export function notFound(req, res) {
  res.status(404).json({ ok: false, message: 'Not found.' });
}

// Central error handler — never leaks stack traces or DB details to the client.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, message: 'Request is too large.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, message: 'Invalid JSON body.' });
  }
  console.error('[error]', err?.code || '', err?.message || err);
  return res.status(500).json({ ok: false, message: 'Something went wrong. Please try again later.' });
}
