// Server-side validation and sanitisation for contact messages.

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

// Strip control characters (keep newlines/tabs in the message) and trim.
const clean = (value, { multiline = false } = {}) => {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const ctrl = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return value.replace(ctrl, '').trim();
};

export function validateContact(body = {}) {
  const data = {
    name: clean(body.name).replace(/\s+/g, ' '),
    email: clean(body.email).toLowerCase(),
    subject: clean(body.subject).replace(/\s+/g, ' '),
    message: clean(body.message, { multiline: true }).replace(/\n{4,}/g, '\n\n\n'),
  };
  const errors = {};

  if (data.name.length < 2 || data.name.length > 100) errors.name = 'Name must be 2–100 characters.';
  if (!EMAIL_RE.test(data.email) || data.email.length > 150) errors.email = 'Please provide a valid email address.';
  if (data.subject.length > 150) errors.subject = 'Subject must be 150 characters or fewer.';
  if (data.message.length < 10 || data.message.length > 3000) errors.message = 'Message must be 10–3000 characters.';

  // Basic abuse checks: too many links in one message.
  const linkCount = (data.message.match(/https?:\/\//gi) || []).length;
  if (linkCount > 3) errors.message = 'Please include no more than 3 links.';

  return { data, errors, valid: Object.keys(errors).length === 0 };
}
