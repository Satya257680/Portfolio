// Server-side validation and sanitisation for chat inputs.
import { config } from '../config.js';

export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export const clean = (value, { multiline = false } = {}) => {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const ctrl = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return value.replace(ctrl, '').trim();
};

const result = (data, errors) => ({ data, errors, valid: Object.keys(errors).length === 0 });

export function validateEmail(value) {
  const email = clean(value).toLowerCase();
  return EMAIL_RE.test(email) && email.length <= 150 ? email : null;
}

export function validateVerificationRequest(body = {}) {
  const data = {
    name: clean(body.name).replace(/\s+/g, ' '),
    email: clean(body.email).toLowerCase(),
  };
  const errors = {};
  if (data.name.length < 2 || data.name.length > 100) errors.name = 'Name must be 2–100 characters.';
  if (!validateEmail(data.email)) errors.email = 'Please provide a valid email address.';
  return result(data, errors);
}

export function validateVerifyCode(body = {}) {
  const data = {
    email: clean(body.email).toLowerCase(),
    code: clean(body.code).replace(/\s+/g, ''),
  };
  const errors = {};
  if (!validateEmail(data.email)) errors.email = 'Please provide a valid email address.';
  if (!/^\d{6}$/.test(data.code)) errors.code = 'Enter the 6-digit code from the email.';
  return result(data, errors);
}

export function validateMessage(body = {}) {
  const max = config.chat.messageMaxLength;
  const data = {
    body: clean(body.body, { multiline: true }).replace(/\n{4,}/g, '\n\n\n'),
    clientMessageId: clean(body.clientMessageId),
  };
  const errors = {};
  if (!data.body) errors.body = 'Message cannot be empty.';
  else if (data.body.length > max) errors.body = `Message must be ${max} characters or fewer.`;
  const links = (data.body.match(/https?:\/\//gi) || []).length;
  if (links > 5) errors.body = 'Please include no more than 5 links.';
  if (data.clientMessageId && !/^[A-Za-z0-9_-]{8,64}$/.test(data.clientMessageId)) {
    errors.clientMessageId = 'Invalid client message id.';
  }
  return result(data, errors);
}

export function validateGroup(body = {}, { partial = false } = {}) {
  const data = {
    title: clean(body.title).replace(/\s+/g, ' '),
    description: clean(body.description).replace(/\s+/g, ' '),
    memberEmails: Array.isArray(body.memberEmails) ? body.memberEmails.slice(0, 50) : [],
  };
  const errors = {};
  if (!partial || body.title !== undefined) {
    if (data.title.length < 2 || data.title.length > 100) errors.title = 'Group name must be 2–100 characters.';
  }
  if (data.description.length > 300) errors.description = 'Description must be 300 characters or fewer.';
  const emails = [];
  for (const e of data.memberEmails) {
    const v = validateEmail(e);
    if (!v) {
      errors.memberEmails = `Invalid email: ${String(e).slice(0, 60)}`;
      break;
    }
    if (!emails.includes(v)) emails.push(v);
  }
  data.memberEmails = emails;
  return result(data, errors);
}

export function parseId(value) {
  const n = Number.parseInt(value, 10);
  return Number.isSafeInteger(n) && n > 0 && String(n) === String(value).trim() ? n : null;
}
