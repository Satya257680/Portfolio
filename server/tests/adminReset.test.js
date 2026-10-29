// Admin password-reset flow: provider success / rejection / network failure, missing configuration,
// unregistered email, expired code and the per-email rate limit. Runs without MySQL or a real email
// provider: the database is an in-memory fake and fetch() is stubbed.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- in-memory stand-in for the few tables this flow touches ----------
const db = { admins: [], codes: [], sessions: [], deliveries: [], audits: [], nextId: 1 };
const now = () => Date.now();

function fakeQuery(sql, params = []) {
  const q = sql.replace(/\s+/g, ' ').trim();
  if (q.startsWith('SELECT id, email, is_active FROM admin_users')) {
    return [db.admins.filter((a) => a.email === params[0]).slice(0, 1)];
  }
  if (q.startsWith('SELECT COUNT(*) AS n FROM chat_verification_codes')) {
    const n = db.codes.filter((c) => c.email === params[0] && c.purpose === 'admin_password_reset' && c.createdAt > now() - 15 * 60e3).length;
    return [[{ n }]];
  }
  if (q.startsWith('INSERT INTO chat_verification_codes')) {
    const id = db.nextId++;
    db.codes.push({ id, email: params[0], codeHash: params[1], purpose: 'admin_password_reset', expiresAt: params[2].getTime(), createdAt: now(), usedAt: null, attempts: 0 });
    return [{ insertId: id }];
  }
  if (q.startsWith('UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE email = ?')) {
    db.codes.filter((c) => c.email === params[0] && !c.usedAt && c.id < params[1]).forEach((c) => { c.usedAt = now(); });
    return [{}];
  }
  if (q.startsWith('UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?')) {
    db.codes.filter((c) => c.id === params[0]).forEach((c) => { c.usedAt = now(); });
    return [{}];
  }
  if (q.startsWith('UPDATE chat_verification_codes SET attempts = attempts + 1')) {
    db.codes.filter((c) => c.id === params[0]).forEach((c) => { c.attempts += 1; });
    return [{}];
  }
  if (q.startsWith('SELECT id, code_hash, attempts FROM chat_verification_codes')) {
    const rows = db.codes
      .filter((c) => c.email === params[0] && !c.usedAt && c.expiresAt > now())
      .sort((a, b) => b.id - a.id)
      .slice(0, 1)
      .map((c) => ({ id: c.id, code_hash: c.codeHash, attempts: c.attempts }));
    return [rows];
  }
  if (q.startsWith('UPDATE admin_users SET password_hash')) {
    const a = db.admins.find((x) => x.email === params[1] && x.is_active);
    if (a) a.password_hash = params[0];
    return [{ affectedRows: a ? 1 : 0 }];
  }
  if (q.startsWith('SELECT id FROM admin_users')) return [db.admins.filter((a) => a.email === params[0]).map((a) => ({ id: a.id }))];
  if (q.startsWith('UPDATE chat_sessions')) {
    db.sessions.push(params[0]);
    return [{}];
  }
  if (q.startsWith('INSERT INTO email_delivery_logs')) {
    db.deliveries.push({ kind: params[0], status: params[4] });
    return [{ insertId: db.deliveries.length }];
  }
  if (q.startsWith('INSERT INTO chat_audit_logs')) {
    db.audits.push(params[1]);
    return [{}];
  }
  throw new Error(`fake db: unhandled query: ${q}`);
}

vi.mock('../src/db.js', () => ({
  getPool: () => ({ query: async (sql, params) => fakeQuery(sql, params) }),
  isChatReady: async () => true,
  isDatabaseReady: async () => true,
}));

let config;
let admin;
let mailer;
let security;
let logs;
const API_KEY = 'xkeysib-unit-test-key-0000';
const ADMIN = 'owner.admin@example.com';

function call(handler, body) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; resolve(this); return this; },
    };
    handler({ body }, res, reject);
  });
}

// Pulls the 6-digit code out of the email the provider was asked to send.
const sentCode = (fetchMock) => JSON.parse(fetchMock.mock.calls.at(-1)[1].body).subject.match(/^(\d{6}) /)[1];
const logText = () => logs.join('\n');

beforeAll(async () => {
  ({ config } = await import('../src/config.js'));
  admin = await import('../src/controllers/admin.controller.js');
  mailer = await import('../src/services/email/mailer.js');
  security = await import('../src/utils/security.js');
});

beforeEach(async () => {
  db.admins = [{ id: 1, email: ADMIN, is_active: 1, password_hash: await security.hashPassword('old-password-123') }];
  db.codes = [];
  db.sessions = [];
  db.deliveries = [];
  db.audits = [];
  config.env = 'production';
  config.admin.ownerEmail = ADMIN; // only the owner admin email is eligible for admin resets
  config.email.provider = 'brevo';
  config.email.brevoApiKey = API_KEY;
  config.email.from = 'Portfolio Chat <no-reply@example.com>';
  process.env.MAIL_FROM = config.email.from;
  logs = [];
  for (const level of ['log', 'warn', 'error']) {
    vi.spyOn(console, level).mockImplementation((...args) => logs.push(args.join(' ')));
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

afterAll(() => {
  delete process.env.MAIL_FROM;
});

describe('admin reset — request code', () => {
  it('provider success: code stored, Brevo called, generic response, safe logs', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: '<abc@smtp-relay.brevo.com>' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await call(admin.requestAdminPasswordReset, { email: '  Owner.Admin@Example.com ' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, message: admin.ADMIN_RESET_GENERIC });
    expect(res.body.message).not.toMatch(/has been sent|delivered/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.brevo.com/v3/smtp/email');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toEqual([{ email: ADMIN }]); // normalised
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.subject).toMatch(/^\d{6} is your Portfolio admin password reset code$/);
    expect(sent.htmlContent).not.toContain('#verify='); // code never in a URL
    expect(db.codes).toHaveLength(1);
    expect(db.codes[0].email).toBe(ADMIN);
    expect(db.codes[0].expiresAt).toBeGreaterThan(Date.now() + 9 * 60e3);
    expect(db.deliveries).toEqual([{ kind: 'admin_password_reset', status: 'sent' }]);

    const code = sentCode(fetchMock);
    const out = logText();
    expect(out).toContain('"event":"admin_reset.send_result"');
    expect(out).toContain('"status":"sent"');
    expect(out).toContain('<abc@smtp-relay.brevo.com>');
    expect(out).toContain('ow***@example.com');
    expect(out).not.toContain(ADMIN);
    expect(out).not.toContain(code);
    expect(out).not.toContain(API_KEY);
  });

  it('provider rejection: 502, new code retired, older emailed code still valid, reason logged', async () => {
    // First request succeeds (code A emailed), second is rejected by Brevo.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"messageId":"m1"}', { status: 201 })));
    await call(admin.requestAdminPasswordReset, { email: ADMIN });
    const fetchFail = vi.fn(async () => new Response(JSON.stringify({ code: 'invalid_parameter', message: 'Sender is not valid' }), { status: 400 }));
    vi.stubGlobal('fetch', fetchFail);

    const res = await call(admin.requestAdminPasswordReset, { email: ADMIN });

    expect(res.statusCode).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toMatch(/Could not send the reset email.*Reference: /);
    expect(fetchFail).toHaveBeenCalledTimes(1); // 4xx is permanent: no retry
    expect(db.codes[1].usedAt).not.toBeNull(); // undeliverable code retired
    expect(db.codes[0].usedAt).toBeNull(); // code A was not cancelled by the failed request
    const out = logText();
    expect(out).toContain('"category":"provider_rejected"');
    expect(out).toContain('"httpStatus":400');
    expect(out).toContain('Sender is not valid');
    expect(out).not.toContain(API_KEY);
  });

  it('network failure: retried, then reported as failed (not as success)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const fetchMock = vi.fn(async () => { throw new TypeError('fetch failed'); });
    vi.stubGlobal('fetch', fetchMock);

    const pending = call(admin.requestAdminPasswordReset, { email: ADMIN });
    await vi.runAllTimersAsync();
    const res = await pending;

    expect(res.statusCode).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logText()).toContain('"category":"network"');
  });

  it('missing configuration in production: no provider call, 502, config issue logged by name', async () => {
    config.email.brevoApiKey = '';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await call(admin.requestAdminPasswordReset, { email: ADMIN });

    expect(res.statusCode).toBe(502);
    expect(res.body.devCode).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.codes[0].usedAt).not.toBeNull();
    expect(logText()).toContain('"category":"not_configured"');
    expect(logText()).toContain('BREVO_API_KEY is not set');
  });

  it('missing configuration in development: returns the dev code instead of failing', async () => {
    config.env = 'development';
    config.email.brevoApiKey = '';
    vi.stubGlobal('fetch', vi.fn());

    const res = await call(admin.requestAdminPasswordReset, { email: ADMIN });

    expect(res.statusCode).toBe(200);
    expect(res.body.devCode).toMatch(/^\d{6}$/);
  });

  it('unregistered email: same generic response, no code, no send, reason logged', async () => {
    config.admin.ownerEmail = 'someone.else@example.com'; // the owner address, but no admin_users row
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await call(admin.requestAdminPasswordReset, { email: 'someone.else@example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, message: admin.ADMIN_RESET_GENERIC });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.codes).toHaveLength(0);
    expect(logText()).toContain('"event":"admin_reset.ineligible"');
    expect(logText()).toContain('"reason":"not_registered"');
    expect(logText()).not.toContain('someone.else@example.com');
  });

  it('registered but non-owner admin email: same generic response, no code, no send', async () => {
    db.admins.push({ id: 2, email: 'second.admin@example.com', is_active: 1, password_hash: 'x' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await call(admin.requestAdminPasswordReset, { email: 'second.admin@example.com' });

    expect(res.body).toEqual({ ok: true, message: admin.ADMIN_RESET_GENERIC });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.codes).toHaveLength(0);
    expect(logText()).toContain('"reason":"not_owner_email"');
    expect(logText()).not.toContain('second.admin@example.com');
    // A code for a non-owner address can never set an admin password.
    const reset = await call(admin.resetAdminPassword, { email: 'second.admin@example.com', code: '123456', password: 'brand-new-password-1' });
    expect(reset.statusCode).toBe(400);
  });

  it('inactive admin: treated like an unregistered email', async () => {
    db.admins[0].is_active = 0;
    vi.stubGlobal('fetch', vi.fn());
    const res = await call(admin.requestAdminPasswordReset, { email: ADMIN });
    expect(res.body.message).toBe(admin.ADMIN_RESET_GENERIC);
    expect(logText()).toContain('"reason":"admin_inactive"');
  });

  it('invalid email: 422', async () => {
    const res = await call(admin.requestAdminPasswordReset, { email: 'not-an-email' });
    expect(res.statusCode).toBe(422);
  });

  it('rate limit: blocks after CHAT_CODES_PER_EMAIL requests in 15 minutes', async () => {
    const fetchMock = vi.fn(async () => new Response('{"messageId":"m"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i < config.chat.codesPerEmailPerWindow; i += 1) {
      expect((await call(admin.requestAdminPasswordReset, { email: ADMIN })).statusCode).toBe(200);
    }
    const res = await call(admin.requestAdminPasswordReset, { email: ADMIN });
    expect(res.statusCode).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(config.chat.codesPerEmailPerWindow);
    expect(logText()).toContain('"event":"admin_reset.rate_limited"');
    // Only the newest code stays usable.
    expect(db.codes.filter((c) => !c.usedAt).map((c) => c.id)).toEqual([db.codes.at(-1).id]);
  });
});

describe('admin reset — set new password', () => {
  async function requestCode() {
    const fetchMock = vi.fn(async () => new Response('{"messageId":"m"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await call(admin.requestAdminPasswordReset, { email: ADMIN });
    return sentCode(fetchMock);
  }

  it('valid code resets the password once and revokes admin sessions', async () => {
    const code = await requestCode();
    const res = await call(admin.resetAdminPassword, { email: ADMIN, code, password: 'brand-new-password-1' });
    expect(res.statusCode).toBe(200);
    expect(await security.verifyPassword('brand-new-password-1', db.admins[0].password_hash)).toBe(true);
    expect(db.sessions).toEqual([1]);
    expect(logText()).not.toContain(code);

    const again = await call(admin.resetAdminPassword, { email: ADMIN, code, password: 'another-password-22' });
    expect(again.statusCode).toBe(400); // single use
  });

  it('expired code is rejected', async () => {
    const code = await requestCode();
    db.codes[0].expiresAt = Date.now() - 1000;
    const res = await call(admin.resetAdminPassword, { email: ADMIN, code, password: 'brand-new-password-1' });
    expect(res.statusCode).toBe(400);
    expect(logText()).toContain('"reason":"no_active_code"');
    expect(await security.verifyPassword('old-password-123', db.admins[0].password_hash)).toBe(true);
  });

  it('wrong codes are attempt-limited', async () => {
    const code = await requestCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < config.chat.codeMaxAttempts; i += 1) {
      expect((await call(admin.resetAdminPassword, { email: ADMIN, code: wrong, password: 'brand-new-password-1' })).statusCode).toBe(400);
    }
    const res = await call(admin.resetAdminPassword, { email: ADMIN, code, password: 'brand-new-password-1' });
    expect(res.statusCode).toBe(400); // even the right code is refused after too many attempts
    expect(logText()).toContain('"reason":"too_many_attempts"');
  });

  it('short password is rejected before the code is checked', async () => {
    const res = await call(admin.resetAdminPassword, { email: ADMIN, code: '123456', password: 'short' });
    expect(res.statusCode).toBe(422);
  });
});

describe('email configuration checks', () => {
  it('flags a resend.dev sender when Brevo is the provider', () => {
    config.email.from = 'Portfolio Chat <onboarding@resend.dev>';
    expect(mailer.getEmailConfigIssues().join(' ')).toMatch(/resend\.dev address/);
  });

  it('reports no issues for a complete Brevo setup', () => {
    expect(mailer.getEmailConfigIssues()).toEqual([]);
  });

  it('redacts addresses', () => {
    expect(mailer.redactEmail('Satyajit.IT.2026@gmail.com')).toBe('sa***@gmail.com');
    expect(mailer.redactEmail('a@b.co')).toBe('a***@b.co');
    expect(mailer.redactEmail('bad')).toBe('[invalid-address]');
  });
});
