// End-to-end API tests against a real MySQL/MariaDB/TiDB database.
// Run with:  TEST_DB=1 NODE_ENV=test DISABLE_RATE_LIMIT=true DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=... DB_SSL=false npm test
// Skipped automatically when TEST_DB is not set, so `npm test` stays green without a database.
import http from 'node:http';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.TEST_DB === '1';
const d = enabled ? describe : describe.skip;

d('chat + admin API (integration)', () => {
  let app;
  let server;
  let port;
  let pool;
  let mods;
  const stamp = Date.now();
  const emailA = `alice.${stamp}@example.com`;
  const emailB = `bob.${stamp}@example.com`;
  const adminEmail = `admin.${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  // Only the configured owner email may be an admin; point it at this run's admin account.
  // Set before the server modules (config) are imported in beforeAll.
  process.env.ADMIN_OWNER_EMAIL = adminEmail;
  let tokenA;
  let tokenB;
  let adminToken;
  let convA;
  let userA;
  let userB;
  let groupId;

  const api = () => request(server);
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  async function verify(name, email) {
    const r1 = await api().post('/api/chat/auth/request-verification').send({ name, email });
    expect(r1.status).toBe(200);
    expect(r1.body.emailSent).toBe(false); // no provider in tests → never claims "sent"
    expect(r1.body.devCode).toMatch(/^\d{6}$/);
    const r2 = await api().post('/api/chat/auth/verify').send({ email, code: r1.body.devCode });
    expect(r2.status).toBe(200);
    // New accounts create a password after verifying; that step returns the session.
    expect(r2.body.requiresPasswordSetup).toBe(true);
    const r3 = await api().post('/api/chat/auth/set-password').send({ email, code: r1.body.devCode, password: `${name}-password-1` });
    expect(r3.status).toBe(200);
    return r3.body;
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
    await pool.query('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [
      adminEmail,
      await hashPassword(adminPassword),
    ]);
    app = createApp();
    server = http.createServer(app);
    attachRealtime(server);
    await new Promise((r) => server.listen(0, r));
    port = server.address().port;
  });

  afterAll(async () => {
    const { closeRealtime } = await import('../src/services/realtime.js');
    await closeRealtime();
    await new Promise((r) => setTimeout(r, 200)); // let background email logs finish
    await mods.db.closePool();
  });

  it('reports health with database and chat readiness', async () => {
    const r = await api().get('/api/health');
    expect(r.body).toMatchObject({ ok: true, database: true, chat: true });
  });

  it('keeps the existing contact form working and logs notification status', async () => {
    const r = await api()
      .post('/api/contact')
      .send({ name: 'Test Person', email: `contact.${stamp}@example.com`, subject: 'Hi', message: 'Hello there, this is a test.' });
    expect(r.status).toBe(201);
    await new Promise((res) => setTimeout(res, 150));
    const [logs] = await pool.query(
      "SELECT status FROM email_delivery_logs WHERE related_type = 'contact_message' AND related_id = ?",
      [r.body.id],
    );
    expect(logs.length).toBe(2); // owner notification + visitor receipt
    expect(logs.every((l) => l.status === 'skipped')).toBe(true);
  });

  it('rejects invalid verification input and the owner email', async () => {
    const bad = await api().post('/api/chat/auth/request-verification').send({ name: 'A', email: 'nope' });
    expect(bad.status).toBe(422);
    const owner = await api()
      .post('/api/chat/auth/request-verification')
      .send({ name: 'Fake Owner', email: 'satyajit.it.2026@gmail.com' });
    expect(owner.status).toBe(403);
  });

  it('verification codes are single-use, attempt-limited and expire', async () => {
    const email = `codes.${stamp}@example.com`;
    const r1 = await api().post('/api/chat/auth/request-verification').send({ name: 'Code Tester', email });
    const wrong = r1.body.devCode === '000000' ? '111111' : '000000';
    const w = await api().post('/api/chat/auth/verify').send({ email, code: wrong });
    expect(w.status).toBe(400);
    expect(w.body.message).toMatch(/attempt/);
    const ok = await api().post('/api/chat/auth/verify').send({ email, code: r1.body.devCode });
    expect(ok.status).toBe(200);
    // A new account consumes the code when it sets its password; after that the code is dead.
    const setup = await api().post('/api/chat/auth/set-password').send({ email, code: r1.body.devCode, password: 'code-tester-password' });
    expect(setup.status).toBe(200);
    const reuse = await api().post('/api/chat/auth/verify').send({ email, code: r1.body.devCode });
    expect(reuse.status).toBe(400);

    // Expiry is checked with a fresh address (the first one now has an account).
    const email2 = `codes2.${stamp}@example.com`;
    const r2 = await api().post('/api/chat/auth/request-verification').send({ name: 'Code Tester', email: email2 });
    expect(r2.body.devCode).toMatch(/^\d{6}$/);
    await pool.query(
      'UPDATE chat_verification_codes SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE email = ? AND used_at IS NULL',
      [email2],
    );
    const expired = await api().post('/api/chat/auth/verify').send({ email: email2, code: r2.body.devCode });
    expect(expired.status).toBe(400);
    const [[row]] = await pool.query('SELECT COUNT(*) AS n FROM chat_verification_codes WHERE code_hash = ?', [r2.body.devCode]);
    expect(Number(row.n)).toBe(0); // codes are stored hashed, never in plaintext
  });

  it('verifies two visitors, each with a private direct conversation', async () => {
    const a = await verify('Alice Visitor', emailA);
    const b = await verify('Bob Visitor', emailB);
    tokenA = a.token;
    tokenB = b.token;
    convA = a.conversationId;
    userA = a.user.id;
    userB = b.user.id;
    expect(a.conversationId).not.toBe(b.conversationId);
    const list = await api().get('/api/chat/conversations').set(auth(tokenA));
    expect(list.body.conversations.map((c) => c.id)).toEqual([convA]);
    expect(list.body.conversations[0].other.isOwner).toBe(true);
    expect(list.body.conversations[0].other.email).toBeUndefined(); // no emails leaked to visitors
  });

  it('requires a session for private endpoints', async () => {
    expect((await api().get('/api/chat/conversations')).status).toBe(401);
    expect((await api().get('/api/chat/conversations').set(auth('x'.repeat(43)))).status).toBe(401);
  });

  it('stores a message exactly once per clientMessageId (idempotent retry)', async () => {
    const body = { body: 'Hi Satyajit! <script>alert(1)</script>', clientMessageId: `cm_${stamp}_1` };
    const r1 = await api().post(`/api/chat/conversations/${convA}/messages`).set(auth(tokenA)).send(body);
    expect(r1.status).toBe(201);
    expect(r1.body.saved).toBe(true);
    const r2 = await api().post(`/api/chat/conversations/${convA}/messages`).set(auth(tokenA)).send(body);
    expect(r2.status).toBe(200);
    expect(r2.body.duplicate).toBe(true);
    expect(r2.body.message.id).toBe(r1.body.message.id);
    const msgs = await api().get(`/api/chat/conversations/${convA}/messages`).set(auth(tokenA));
    expect(msgs.body.messages.filter((m) => m.clientMessageId === body.clientMessageId).length).toBe(1);
    // Stored as plain text; the client renders it as text (never HTML).
    expect(msgs.body.messages.at(-1).body).toContain('<script>');
  });

  it('notifies the owner by email for a visitor message', async () => {
    await new Promise((res) => setTimeout(res, 150));
    const [logs] = await pool.query(
      "SELECT recipient, status FROM email_delivery_logs WHERE kind = 'chat_owner_notification' ORDER BY id DESC LIMIT 1",
    );
    expect(logs[0].recipient).toBe('satyajit.it.2026@gmail.com');
    expect(logs[0].status).toBe('skipped'); // no provider configured in tests
  });

  it('prevents a visitor from reading or writing another visitor’s conversation', async () => {
    expect((await api().get(`/api/chat/conversations/${convA}/messages`).set(auth(tokenB))).status).toBe(404);
    expect((await api().get(`/api/chat/conversations/${convA}`).set(auth(tokenB))).status).toBe(404);
    const w = await api()
      .post(`/api/chat/conversations/${convA}/messages`)
      .set(auth(tokenB))
      .send({ body: 'intrusion' });
    expect(w.status).toBe(404);
  });

  it('rejects empty, oversized and too-large requests', async () => {
    expect((await api().post(`/api/chat/conversations/${convA}/messages`).set(auth(tokenA)).send({ body: '   ' })).status).toBe(422);
    const long = await api()
      .post(`/api/chat/conversations/${convA}/messages`)
      .set(auth(tokenA))
      .send({ body: 'x'.repeat(2500) });
    expect(long.status).toBe(422);
    const huge = await api()
      .post(`/api/chat/conversations/${convA}/messages`)
      .set(auth(tokenA))
      .send({ body: 'x'.repeat(20000) });
    expect(huge.status).toBe(413);
  });

  it('protects admin endpoints from visitors and anonymous users', async () => {
    expect((await api().get('/api/admin/contact-messages')).status).toBe(401);
    expect((await api().get('/api/admin/contact-messages').set(auth(tokenA))).status).toBe(401);
    expect((await api().post('/api/chat/conversations/group').set(auth(tokenA)).send({ title: 'Nope' })).status).toBe(403);
  });

  it('admin signs in, sees unread chats, replies and receives realtime events', async () => {
    const bad = await api().post('/api/admin/auth/login').send({ email: adminEmail, password: 'wrong-password!!' });
    expect(bad.status).toBe(401);
    const ok = await api().post('/api/admin/auth/login').send({ email: adminEmail, password: adminPassword });
    expect(ok.status).toBe(200);
    adminToken = ok.body.token;

    const list = await api().get('/api/chat/conversations?filter=unread').set(auth(adminToken));
    const entry = list.body.conversations.find((c) => c.id === convA);
    expect(entry.unread).toBe(1);
    expect(entry.other.email).toBe(emailA); // admin can see the visitor's verified email

    // Realtime: the visitor socket receives the admin reply.
    const socket = ioClient(`http://localhost:${port}`, { auth: { token: tokenA }, transports: ['websocket'] });
    await new Promise((res, rej) => {
      socket.on('connect', res);
      socket.on('connect_error', rej);
    });
    const got = new Promise((res) => socket.on('message:new', res));
    const reply = await api()
      .post(`/api/chat/conversations/${convA}/messages`)
      .set(auth(adminToken))
      .send({ body: 'Sure! Please share more details about the project.', clientMessageId: `adm_${stamp}_1` });
    expect(reply.status).toBe(201);
    const evt = await got;
    expect(evt.message.body).toContain('share more details');
    socket.close();

    await api().patch(`/api/chat/conversations/${convA}/read`).set(auth(adminToken)).send({});
    const detail = await api().get(`/api/chat/conversations/${convA}`).set(auth(tokenA));
    const owner = detail.body.conversation.members.find((m) => m.isOwner);
    expect(owner.lastReadMessageId).toBeGreaterThan(0);
  });

  it('rejects an invalid socket token', async () => {
    const socket = ioClient(`http://localhost:${port}`, { auth: { token: 'bad' }, transports: ['websocket'], reconnection: false });
    const err = await new Promise((res) => socket.on('connect_error', res));
    expect(err.message).toBe('unauthorized');
    socket.close();
  });

  it('admin creates a group; membership is enforced and removal revokes access', async () => {
    const missing = await api()
      .post('/api/chat/conversations/group')
      .set(auth(adminToken))
      .send({ title: 'Developers Community', memberEmails: [emailA, `ghost.${stamp}@example.com`] });
    expect(missing.status).toBe(422);

    const g = await api()
      .post('/api/chat/conversations/group')
      .set(auth(adminToken))
      .send({ title: 'Developers Community', description: 'Node & React', memberEmails: [emailA, emailB] });
    expect(g.status).toBe(201);
    groupId = g.body.conversationId;

    const bList = await api().get('/api/chat/conversations?filter=groups').set(auth(tokenB));
    expect(bList.body.conversations.map((c) => c.id)).toContain(groupId);
    expect(bList.body.conversations.find((c) => c.id === groupId).memberCount).toBe(3);

    const post = await api().post(`/api/chat/conversations/${groupId}/messages`).set(auth(tokenA)).send({ body: 'Hey all!' });
    expect(post.status).toBe(201);
    const bMsgs = await api().get(`/api/chat/conversations/${groupId}/messages`).set(auth(tokenB));
    expect(bMsgs.body.messages.some((m) => m.body === 'Hey all!' && m.senderName === 'Alice Visitor')).toBe(true);

    // A regular member cannot rename or remove others.
    expect((await api().patch(`/api/chat/conversations/${groupId}`).set(auth(tokenA)).send({ title: 'Hijack' })).status).toBe(403);
    expect((await api().delete(`/api/chat/conversations/${groupId}/members/${userB}`).set(auth(tokenA))).status).toBe(403);

    // Admin removes Bob → Bob loses access immediately.
    expect((await api().delete(`/api/chat/conversations/${groupId}/members/${userB}`).set(auth(adminToken))).status).toBe(200);
    expect((await api().get(`/api/chat/conversations/${groupId}/messages`).set(auth(tokenB))).status).toBe(404);
    expect((await api().post(`/api/chat/conversations/${groupId}/messages`).set(auth(tokenB)).send({ body: 'still here?' })).status).toBe(404);

    // Alice can leave on her own.
    expect((await api().delete(`/api/chat/conversations/${groupId}/members/${userA}`).set(auth(tokenA))).status).toBe(200);
    // The owner cannot be removed.
    const [[owner]] = await pool.query('SELECT id FROM chat_users WHERE is_owner = 1');
    expect((await api().delete(`/api/chat/conversations/${groupId}/members/${owner.id}`).set(auth(adminToken))).status).toBe(403);
  });

  it('admin can close, archive and reopen a conversation', async () => {
    await api().patch(`/api/admin/conversations/${convA}/status`).set(auth(adminToken)).send({ status: 'closed' });
    const blocked = await api().post(`/api/chat/conversations/${convA}/messages`).set(auth(tokenA)).send({ body: 'hello?' });
    expect(blocked.status).toBe(403);
    await api().patch(`/api/admin/conversations/${convA}/status`).set(auth(adminToken)).send({ status: 'archived' });
    const archived = await api().get('/api/chat/conversations?filter=archived').set(auth(adminToken));
    expect(archived.body.conversations.map((c) => c.id)).toContain(convA);
    // A new visitor message brings an archived chat back to the inbox.
    await api().post(`/api/chat/conversations/${convA}/messages`).set(auth(tokenA)).send({ body: 'Following up' });
    const all = await api().get('/api/chat/conversations').set(auth(adminToken));
    expect(all.body.conversations.map((c) => c.id)).toContain(convA);
  });

  it('admin sees contact messages and email delivery status without secrets', async () => {
    const c = await api().get('/api/admin/contact-messages').set(auth(adminToken));
    expect(c.status).toBe(200);
    expect(c.body.messages[0]).not.toHaveProperty('ip_address');
    const id = c.body.messages[0].id;
    expect((await api().patch(`/api/admin/contact-messages/${id}/read`).set(auth(adminToken)).send({ read: true })).body.read).toBe(true);
    const e = await api().get('/api/admin/email-deliveries').set(auth(adminToken));
    expect(e.body.deliveries.length).toBeGreaterThan(0);
  });

  it('blocking a visitor revokes their sessions', async () => {
    const r = await api().post(`/api/admin/users/${userB}/block`).set(auth(adminToken)).send({ blocked: true });
    expect(r.status).toBe(200);
    expect((await api().get('/api/chat/me').set(auth(tokenB))).status).toBe(401);
    const again = await api().post('/api/chat/auth/request-verification').send({ name: 'Bob', email: emailB });
    expect(again.status).toBe(403);
  });

  it('logout revokes the session', async () => {
    expect((await api().post('/api/chat/auth/logout').set(auth(tokenA))).status).toBe(200);
    expect((await api().get('/api/chat/me').set(auth(tokenA))).status).toBe(401);
    expect((await api().post('/api/admin/auth/logout').set(auth(adminToken))).status).toBe(200);
    expect((await api().get('/api/admin/reports').set(auth(adminToken))).status).toBe(401);
  });
});
