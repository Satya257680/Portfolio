// Owner-only admin panel: access control, password handling and attachment size boundaries,
// tested end-to-end against a real MySQL/MariaDB/TiDB database.
// Run with:  TEST_DB=1 NODE_ENV=test DISABLE_RATE_LIMIT=true DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=... DB_SSL=false npm test
// Skipped automatically when TEST_DB is not set.
import http from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.TEST_DB === '1';
const d = enabled ? describe : describe.skip;

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ownerAdminEmail = `owner.${stamp}@example.com`;
// Must be set before the server modules (config) are imported in beforeAll.
if (enabled) process.env.ADMIN_OWNER_EMAIL = ownerAdminEmail;

const MAX = 10 * 1024 * 1024;

d('owner-only admin panel (integration)', () => {
  let server;
  let pool;
  let mods;
  const ownerPassword = 'owner-admin-pass-phrase-1';
  const intruderEmail = `intruder.${stamp}@example.com`;
  const intruderPassword = 'intruder-pass-phrase-12';
  const visitor = { name: 'Vera Visitor', email: `vera.${stamp}@example.com`, password: 'vera-first-password' };
  const other = { name: 'Omar Other', email: `omar.${stamp}@example.com`, password: 'omar-first-password' };
  let adminToken;
  let intruderAdminId;

  const api = () => request(server);
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  async function signUp(person) {
    const r1 = await api().post('/api/chat/auth/request-verification').send({ name: person.name, email: person.email });
    expect(r1.status).toBe(200);
    const r2 = await api().post('/api/chat/auth/verify').send({ email: person.email, code: r1.body.devCode });
    expect(r2.body.requiresPasswordSetup).toBe(true);
    const r3 = await api()
      .post('/api/chat/auth/set-password')
      .send({ email: person.email, code: r1.body.devCode, password: person.password });
    expect(r3.status).toBe(200);
    Object.assign(person, { token: r3.body.token, id: r3.body.user.id, conversationId: r3.body.conversationId });
  }

  // Fails if any password, hash, or hash-shaped value appears anywhere in a response.
  function expectNoSecrets(payload) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    expect(text).not.toMatch(/password_hash|passwordHash/i);
    expect(text).not.toContain('scrypt$');
    for (const secret of [ownerPassword, intruderPassword, visitor.password, other.password]) expect(text).not.toContain(secret);
  }

  beforeAll(async () => {
    const { createApp } = await import('../src/app.js');
    const db = await import('../src/db.js');
    const { runMigrations } = await import('../src/migrations.js');
    const { attachRealtime } = await import('../src/services/realtime.js');
    const authSvc = await import('../src/services/auth.service.js');
    const { hashPassword } = await import('../src/utils/security.js');
    mods = { db, authSvc };
    pool = db.getPool();
    await runMigrations(pool, () => {});
    await authSvc.ensureOwnerUser();
    await pool.query('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [ownerAdminEmail, await hashPassword(ownerPassword)]);
    const [ins] = await pool.query('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [
      intruderEmail,
      await hashPassword(intruderPassword),
    ]);
    intruderAdminId = ins.insertId;
    server = http.createServer(createApp());
    attachRealtime(server);
    await new Promise((r) => server.listen(0, r));
    await signUp(visitor);
    await signUp(other);
  });

  afterAll(async () => {
    const { closeRealtime } = await import('../src/services/realtime.js');
    await closeRealtime();
    await new Promise((r) => setTimeout(r, 200));
    await mods.db.closePool();
  });

  const adminGets = [
    '/api/admin/dashboard',
    '/api/admin/analytics',
    '/api/admin/users',
    '/api/admin/users/export',
    '/api/admin/audit-logs',
    '/api/admin/account',
    '/api/admin/contact-messages',
    '/api/admin/email-deliveries',
    '/api/admin/reports',
  ];

  it('rejects anonymous users and ordinary chat users on every admin endpoint', async () => {
    for (const path of adminGets) {
      expect((await api().get(path)).status, `anonymous ${path}`).toBe(401);
      expect((await api().get(path).set(auth(visitor.token))).status, `visitor ${path}`).toBe(401);
    }
    const id = other.id;
    for (const path of [`/api/admin/users/${id}/sign-out`, `/api/admin/users/${id}/require-password-reset`, `/api/admin/users/${id}/block`]) {
      expect((await api().post(path).set(auth(visitor.token)).send({ confirm: true, blocked: true })).status).toBe(401);
    }
    // The other visitor was not affected by the attempts above.
    expect((await api().get('/api/chat/me').set(auth(other.token))).status).toBe(200);
  });

  it('only the configured owner email can sign in as admin', async () => {
    const intruder = await api().post('/api/admin/auth/login').send({ email: intruderEmail, password: intruderPassword });
    expect(intruder.status).toBe(401);
    expect(intruder.body.message).toBe('Incorrect email or password.');
    expect(intruder.body.token).toBeUndefined();

    const wrong = await api().post('/api/admin/auth/login').send({ email: ownerAdminEmail, password: 'not-the-password' });
    expect(wrong.status).toBe(401);

    const ok = await api().post('/api/admin/auth/login').send({ email: ownerAdminEmail.toUpperCase(), password: ownerPassword });
    expect(ok.status).toBe(200);
    expectNoSecrets(ok.body);
    adminToken = ok.body.token;
    expect((await api().get('/api/chat/me').set(auth(adminToken))).body.isAdmin).toBe(true);
  });

  it('re-checks the admin account on every request (non-owner or deactivated admin sessions are refused)', async () => {
    const ownerId = await mods.authSvc.ensureOwnerUser();
    const forged = await mods.authSvc.createSession({ userId: ownerId, kind: 'admin', adminUserId: intruderAdminId });
    expect((await api().get('/api/admin/dashboard').set(auth(forged.token))).status).toBe(401);

    const [[owner]] = await pool.query('SELECT id FROM admin_users WHERE email = ?', [ownerAdminEmail]);
    const temp = await mods.authSvc.createSession({ userId: ownerId, kind: 'admin', adminUserId: owner.id });
    expect((await api().get('/api/admin/dashboard').set(auth(temp.token))).status).toBe(200);
    await pool.query('UPDATE admin_users SET is_active = 0 WHERE id = ?', [owner.id]);
    try {
      expect((await api().get('/api/admin/dashboard').set(auth(temp.token))).status).toBe(401);
    } finally {
      await pool.query('UPDATE admin_users SET is_active = 1 WHERE id = ?', [owner.id]);
    }
  });

  it('admin password reset is only offered to the owner email', async () => {
    const r = await api().post('/api/admin/auth/request-reset').send({ email: intruderEmail });
    expect(r.status).toBe(200);
    expect(r.body.devCode).toBeUndefined();
    const [[codes]] = await pool.query("SELECT COUNT(*) AS n FROM chat_verification_codes WHERE email = ? AND purpose = 'admin_password_reset'", [
      intruderEmail,
    ]);
    expect(Number(codes.n)).toBe(0);
  });

  it('dashboard shows real database counts', async () => {
    // Other test files may add users concurrently, so the response must lie between two DB counts.
    const count = async () =>
      Number((await pool.query('SELECT COUNT(*) AS n FROM chat_users WHERE is_owner = 0 AND email_verified_at IS NOT NULL'))[0][0].n);
    const before = await count();
    const r = await api().get('/api/admin/dashboard?days=7').set(auth(adminToken));
    const after = await count();
    expect(r.status).toBe(200);
    expect(r.body.users.total).toBeGreaterThanOrEqual(before);
    expect(r.body.users.total).toBeLessThanOrEqual(after);
    expect(r.body.periodDays).toBe(7);
    expect(r.body.users.new).toBeGreaterThanOrEqual(2);
    expect(r.body.users.active24h).toBeGreaterThanOrEqual(2);
    expectNoSecrets(r.body);
  });

  it('lists, searches and paginates users without ever exposing passwords', async () => {
    const all = await api().get(`/api/admin/users?q=${stamp}&page=1&pageSize=1&sort=name`).set(auth(adminToken));
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    expect(all.body.users).toHaveLength(1);
    expect(all.body.users[0].name).toBe('Omar Other'); // sorted by name
    const page2 = await api().get(`/api/admin/users?q=${stamp}&page=2&pageSize=1&sort=name`).set(auth(adminToken));
    expect(page2.body.users[0].email).toBe(visitor.email);
    const u = page2.body.users[0];
    expect(u).toMatchObject({ role: 'user', status: 'active', passwordStatus: 'set', conversationId: visitor.conversationId });
    expect(u).not.toHaveProperty('password');
    expectNoSecrets(all.body);
    expectNoSecrets(page2.body);

    const withOwner = await api().get('/api/admin/users?includeOwner=1&pageSize=100').set(auth(adminToken));
    expect(withOwner.body.users.find((x) => x.isOwner)).toMatchObject({ role: 'admin', passwordStatus: 'admin_managed' });
    expectNoSecrets(withOwner.body);

    const detail = await api().get(`/api/admin/users/${visitor.id}`).set(auth(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.conversations.map((c) => c.id)).toContain(visitor.conversationId);
    expectNoSecrets(detail.body);
  });

  it('exports account metadata as CSV without passwords (and audits it)', async () => {
    const r = await api().get(`/api/admin/users/export?q=${stamp}`).set(auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.text).toContain(visitor.email);
    expect(r.text).toContain('set (hashed)');
    expectNoSecrets(r.text);
    const [[a]] = await pool.query("SELECT COUNT(*) AS n FROM chat_audit_logs WHERE action = 'users.export'");
    expect(Number(a.n)).toBeGreaterThan(0);
  });

  it('requires confirmation and never targets the owner account', async () => {
    expect((await api().post(`/api/admin/users/${other.id}/sign-out`).set(auth(adminToken)).send({})).status).toBe(428);
    const ownerId = await mods.authSvc.ensureOwnerUser();
    expect((await api().post(`/api/admin/users/${ownerId}/sign-out`).set(auth(adminToken)).send({ confirm: true })).status).toBe(400);
    expect((await api().post(`/api/admin/users/${ownerId}/require-password-reset`).set(auth(adminToken)).send({ confirm: true })).status).toBe(400);
  });

  it('signs a user out everywhere', async () => {
    const r = await api().post(`/api/admin/users/${other.id}/sign-out`).set(auth(adminToken)).send({ confirm: true });
    expect(r.status).toBe(200);
    expect(r.body.revoked).toBeGreaterThanOrEqual(1);
    expect((await api().get('/api/chat/me').set(auth(other.token))).status).toBe(401);
    // They can sign in again with their own password.
    const back = await api().post('/api/chat/auth/login').send({ email: other.email, password: other.password });
    expect(back.status).toBe(200);
  });

  it('required password reset clears the old password, signs out, and only the user can set a new one', async () => {
    const r = await api().post(`/api/admin/users/${visitor.id}/require-password-reset`).set(auth(adminToken)).send({ confirm: true });
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty('devCode');
    expect(JSON.stringify(r.body)).not.toMatch(/\b\d{6}\b/); // the reset code is never shown to the admin
    expect((await api().get('/api/chat/me').set(auth(visitor.token))).status).toBe(401);
    expect((await api().post('/api/chat/auth/login').send({ email: visitor.email, password: visitor.password })).status).toBe(401);
    const [[row]] = await pool.query('SELECT password_hash FROM chat_users WHERE id = ?', [visitor.id]);
    expect(row.password_hash).toBeNull();

    const list = await api().get(`/api/admin/users?q=${encodeURIComponent(visitor.email)}`).set(auth(adminToken));
    expect(list.body.users[0].passwordStatus).toBe('reset_required');

    // The user proves ownership of the email and chooses a new password.
    const req1 = await api().post('/api/chat/auth/request-reset').send({ email: visitor.email });
    expect(req1.body.devCode).toMatch(/^\d{6}$/);
    const done = await api()
      .post('/api/chat/auth/reset-password')
      .send({ email: visitor.email, code: req1.body.devCode, password: 'vera-second-password' });
    expect(done.status).toBe(200);
    const login = await api().post('/api/chat/auth/login').send({ email: visitor.email, password: 'vera-second-password' });
    expect(login.status).toBe(200);
    visitor.token = login.body.token;
    visitor.password = 'vera-second-password';

    const [[audited]] = await pool.query(
      "SELECT details FROM chat_audit_logs WHERE action = 'user.password.require_reset' AND target_id = ? ORDER BY id DESC LIMIT 1",
      [visitor.id],
    );
    expect(audited.details).toMatch(/^email=/);
  });

  it('audit log and analytics are available to the owner and contain no secrets', async () => {
    const logs = await api().get('/api/admin/audit-logs?pageSize=100').set(auth(adminToken));
    expect(logs.status).toBe(200);
    expect(logs.body.logs.some((l) => l.action === 'user.sessions.revoke')).toBe(true);
    expectNoSecrets(logs.body);
    const a = await api().get('/api/admin/analytics?days=14&tzOffset=330').set(auth(adminToken));
    expect(a.status).toBe(200);
    expect(a.body.series).toHaveLength(14);
    expect(a.body.totals.signups).toBeGreaterThanOrEqual(2);
    const account = await api().get('/api/admin/account').set(auth(adminToken));
    expect(account.body.account.email).toBe(ownerAdminEmail);
    expectNoSecrets(account.body);
  });

  it('keeps visitor and private conversation lists separate for the owner', async () => {
    const direct = await api().get('/api/chat/conversations?type=direct').set(auth(adminToken));
    expect(direct.body.conversations.every((c) => c.type === 'direct')).toBe(true);
    expect(direct.body.conversations.map((c) => c.id)).toContain(visitor.conversationId);
    const groups = await api().get('/api/chat/conversations?type=group').set(auth(adminToken));
    expect(groups.body.conversations.every((c) => c.type === 'group')).toBe(true);
    // A visitor still only ever sees their own conversation.
    const mine = await api().get('/api/chat/conversations?type=direct').set(auth(visitor.token));
    expect(mine.body.conversations.map((c) => c.id)).toEqual([visitor.conversationId]);
  });

  describe('attachment size limit (10 MB or smaller)', () => {
    const upload = (token, conversationId, buf, name) =>
      api()
        .post(`/api/chat/conversations/${conversationId}/attachments?name=${encodeURIComponent(name)}&type=application%2Fpdf`)
        .set(auth(token))
        .set('Content-Type', 'application/octet-stream')
        .send(buf);

    it('accepts a file of exactly 10 MB', async () => {
      const r = await upload(visitor.token, visitor.conversationId, Buffer.alloc(MAX, 1), 'exact-limit.pdf');
      expect(r.status).toBe(201);
      expect(r.body.message.attachment.size).toBe(MAX);
    });

    it('rejects 10 MB + 1 byte with the dedicated error code', async () => {
      const r = await upload(visitor.token, visitor.conversationId, Buffer.alloc(MAX + 1, 1), 'too-big.pdf');
      expect(r.status).toBe(413);
      expect(r.body).toMatchObject({ ok: false, code: 'ATTACHMENT_TOO_LARGE', maxBytes: MAX });
      const [[n]] = await pool.query("SELECT COUNT(*) AS n FROM chat_attachments WHERE file_name = 'too-big.pdf'");
      expect(Number(n.n)).toBe(0);
    });

    it('rejects an oversized declared Content-Length before reading the body', async () => {
      const r = await api()
        .post(`/api/chat/conversations/${visitor.conversationId}/attachments?name=x.pdf`)
        .set(auth(visitor.token))
        .set('Content-Type', 'application/octet-stream')
        .set('Content-Length', String(MAX + 1))
        .send(Buffer.alloc(10));
      expect(r.status).toBe(413);
      expect(r.body.code).toBe('ATTACHMENT_TOO_LARGE');
    });

    it('uses a different error for blocked file types (not the size error)', async () => {
      const r = await upload(visitor.token, visitor.conversationId, Buffer.alloc(100, 1), 'clip.mp4');
      expect(r.status).toBe(415);
      expect(r.body.code).toBeUndefined();
    });

    it('does not let another visitor download the attachment', async () => {
      const [[att]] = await pool.query("SELECT id FROM chat_attachments WHERE file_name = 'exact-limit.pdf' ORDER BY id DESC LIMIT 1");
      const login = await api().post('/api/chat/auth/login').send({ email: other.email, password: other.password });
      expect((await api().get(`/api/chat/attachments/${att.id}/download`).set(auth(login.body.token))).status).toBe(404);
      expect((await api().get(`/api/chat/attachments/${att.id}/download`).set(auth(adminToken))).status).toBe(200);
    });
  });

  it('signs out other admin sessions but keeps the current one', async () => {
    const second = await api().post('/api/admin/auth/login').send({ email: ownerAdminEmail, password: ownerPassword });
    const r = await api().post('/api/admin/auth/logout-others').set(auth(adminToken));
    expect(r.status).toBe(200);
    expect((await api().get('/api/admin/account').set(auth(second.body.token))).status).toBe(401);
    expect((await api().get('/api/admin/account').set(auth(adminToken))).status).toBe(200);
  });
});
