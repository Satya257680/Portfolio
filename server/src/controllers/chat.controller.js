import { config } from '../config.js';
import { getPool } from '../db.js';
import { audit, ensureOwnerUser } from '../services/auth.service.js';
import {
  ChatError,
  addMembers,
  createGroup,
  createMessage,
  findVerifiedUsersByEmail,
  getConversationDetail,
  getOrCreateDirect,
  listConversations,
  listMessages,
  markRead,
  markUnread,
  removeMember,
  requireMembership,
  updateGroup,
} from '../services/chat.service.js';
import { notifyNewMessage } from '../services/notifications.js';
import { emitToConversation, emitToUsers } from '../services/realtime.js';
import { clean, parseId, validateGroup, validateMessage } from '../validators/chat.validator.js';

// Wraps async handlers; ChatError becomes a clean JSON response.
export const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof ChatError) return res.status(err.status).json({ ok: false, message: err.message, ...err.extra });
    return next(err);
  }
};

function idParam(req, name = 'id') {
  const id = parseId(req.params[name]);
  if (!id) throw new ChatError(404, 'Conversation not found.');
  return id;
}

function canManageGroup(auth, membership) {
  return membership.type === 'group' && (membership.role === 'admin' || auth.isAdmin);
}

async function systemMessage(conversationId, actor, body) {
  const { message } = await createMessage({ conversationId, senderId: actor.userId, body, type: 'system' });
  await emitToConversation(conversationId, 'message:new', { conversationId, message });
  return message;
}

// GET /api/chat/conversations?filter=all|unread|groups|archived&q=
export const getConversations = handle(async (req, res) => {
  const filter = ['all', 'unread', 'groups', 'archived'].includes(req.query.filter) ? req.query.filter : 'all';
  const q = clean(String(req.query.q || '')).slice(0, 80);
  const conversations = await listConversations(req.auth.userId, { filter, q, isAdmin: req.auth.isAdmin });
  res.json({ ok: true, conversations });
});

// POST /api/chat/conversations/direct — a visitor's private chat with the owner.
export const startDirect = handle(async (req, res) => {
  if (req.auth.isOwner) throw new ChatError(400, 'The owner already has a direct chat with every visitor.');
  const ownerId = await ensureOwnerUser();
  const id = await getOrCreateDirect(req.auth.userId, ownerId);
  res.status(201).json({ ok: true, conversationId: id });
});

// POST /api/chat/conversations/group — only the portfolio owner may create groups.
export const postGroup = handle(async (req, res) => {
  if (!req.auth.isAdmin) throw new ChatError(403, 'Only the portfolio owner can create groups.');
  const { data, errors, valid } = validateGroup(req.body);
  if (!valid) throw new ChatError(422, 'Please correct the highlighted fields.', { errors });
  const { users, missing } = await findVerifiedUsersByEmail(data.memberEmails);
  if (missing.length) {
    throw new ChatError(422, `These people must verify their email on /chat before they can be added: ${missing.join(', ')}`, {
      errors: { memberEmails: 'Some emails are not verified chat users.' },
      missing,
    });
  }
  const id = await createGroup({
    creatorId: req.auth.userId,
    title: data.title,
    description: data.description,
    memberIds: users.map((u) => u.id),
  });
  await systemMessage(id, req.auth, `${req.auth.name} created the group “${data.title}”`);
  emitToUsers([req.auth.userId, ...users.map((u) => u.id)], 'conversation:new', { conversationId: id });
  await audit(req.auth.userId, 'group.create', 'conversation', id, `members=${users.length}`);
  res.status(201).json({ ok: true, conversationId: id });
});

// GET /api/chat/conversations/:id
export const getConversation = handle(async (req, res) => {
  const conversation = await getConversationDetail(idParam(req), req.auth.userId, { isAdmin: req.auth.isAdmin });
  res.json({ ok: true, conversation });
});

// GET /api/chat/conversations/:id/messages?before=&limit=
export const getMessages = handle(async (req, res) => {
  const id = idParam(req);
  await requireMembership(id, req.auth.userId);
  const before = req.query.before ? parseId(req.query.before) : null;
  const result = await listMessages(id, { before, limit: req.query.limit });
  res.json({ ok: true, ...result });
});

// POST /api/chat/conversations/:id/messages
export const postMessage = handle(async (req, res) => {
  const id = idParam(req);
  const membership = await requireMembership(id, req.auth.userId);
  if (membership.status === 'closed' && !req.auth.isOwner) {
    throw new ChatError(403, 'This conversation has been closed. Please use the contact form or email instead.');
  }
  const { data, errors, valid } = validateMessage(req.body);
  if (!valid) throw new ChatError(422, errors.body || 'Invalid message.', { errors });

  const { message, duplicate } = await createMessage({
    conversationId: id,
    senderId: req.auth.userId,
    body: data.body,
    clientMessageId: data.clientMessageId || null,
    reopen: !req.auth.isOwner,
  });

  if (!duplicate) {
    await emitToConversation(id, 'message:new', { conversationId: id, message });
    const title =
      membership.type === 'group' ? membership.title : req.auth.isOwner ? config.owner.name : req.auth.name;
    notifyNewMessage({
      conversation: { id, type: membership.type, title },
      message,
      sender: req.auth,
    }).catch((err) => console.error('[notify] failed:', err?.message));
  }
  // "saved" means stored in the database; email notification status is tracked separately.
  res.status(duplicate ? 200 : 201).json({ ok: true, message, duplicate, saved: true });
});

// PATCH /api/chat/conversations/:id/read  { upTo? }
export const patchRead = handle(async (req, res) => {
  const id = idParam(req);
  await requireMembership(id, req.auth.userId);
  const upTo = req.body?.upTo ? parseId(String(req.body.upTo)) : null;
  const lastReadMessageId = await markRead(id, req.auth.userId, upTo);
  await emitToConversation(id, 'read:updated', { conversationId: id, userId: req.auth.userId, lastReadMessageId });
  res.json({ ok: true, lastReadMessageId });
});

// PATCH /api/chat/conversations/:id/unread
export const patchUnread = handle(async (req, res) => {
  const id = idParam(req);
  await requireMembership(id, req.auth.userId);
  await markUnread(id, req.auth.userId);
  res.json({ ok: true });
});

// PATCH /api/chat/conversations/:id/mute  { hours: 0 | 8 | 168 }
export const patchMute = handle(async (req, res) => {
  const id = idParam(req);
  await requireMembership(id, req.auth.userId);
  const hours = Number(req.body?.hours);
  if (![0, 8, 168, 8760].includes(hours)) throw new ChatError(422, 'Choose a valid mute duration.');
  const until = hours ? new Date(Date.now() + hours * 3600 * 1000) : null;
  await getPool().query('UPDATE chat_conversation_members SET muted_until = ? WHERE conversation_id = ? AND user_id = ?', [
    until,
    id,
    req.auth.userId,
  ]);
  res.json({ ok: true, mutedUntil: until });
});

// PATCH /api/chat/conversations/:id  { title?, description? } — group admins only.
export const patchGroup = handle(async (req, res) => {
  const id = idParam(req);
  const membership = await requireMembership(id, req.auth.userId);
  if (!canManageGroup(req.auth, membership)) throw new ChatError(403, 'Only group admins can change group details.');
  const { data, errors, valid } = validateGroup(req.body, { partial: true });
  if (!valid) throw new ChatError(422, 'Please correct the highlighted fields.', { errors });
  await updateGroup(id, {
    title: req.body.title !== undefined ? data.title : undefined,
    description: req.body.description !== undefined ? data.description : undefined,
  });
  if (req.body.title !== undefined && data.title !== membership.title) {
    await systemMessage(id, req.auth, `${req.auth.name} renamed the group to “${data.title}”`);
  }
  await emitToConversation(id, 'conversation:updated', { conversationId: id });
  await audit(req.auth.userId, 'group.update', 'conversation', id);
  res.json({ ok: true });
});

// PATCH /api/chat/conversations/:id/members  { addEmails: [] } — group admins only.
export const patchMembers = handle(async (req, res) => {
  const id = idParam(req);
  const membership = await requireMembership(id, req.auth.userId);
  if (!canManageGroup(req.auth, membership)) throw new ChatError(403, 'Only group admins can add members.');
  const { data, errors } = validateGroup({ title: 'xx', memberEmails: req.body?.addEmails }, { partial: true });
  if (errors.memberEmails) throw new ChatError(422, errors.memberEmails, { errors });
  if (!data.memberEmails.length) throw new ChatError(422, 'Add at least one email.');
  const { users, missing } = await findVerifiedUsersByEmail(data.memberEmails);
  if (missing.length) {
    throw new ChatError(422, `These people must verify their email on /chat first: ${missing.join(', ')}`, { missing });
  }
  const added = await addMembers(id, users.map((u) => u.id));
  const names = users.filter((u) => added.includes(u.id)).map((u) => u.display_name);
  if (names.length) await systemMessage(id, req.auth, `${req.auth.name} added ${names.join(', ')}`);
  emitToUsers(added, 'conversation:new', { conversationId: id });
  await emitToConversation(id, 'conversation:updated', { conversationId: id });
  await audit(req.auth.userId, 'group.members.add', 'conversation', id, `added=${added.join(',')}`);
  res.json({ ok: true, added });
});

// DELETE /api/chat/conversations/:id/members/:userId — admins remove; anyone may leave.
export const deleteMember = handle(async (req, res) => {
  const id = idParam(req);
  const targetId = parseId(req.params.userId);
  if (!targetId) throw new ChatError(404, 'Member not found.');
  const membership = await requireMembership(id, req.auth.userId);
  if (membership.type !== 'group') throw new ChatError(400, 'Members can only be removed from groups.');
  const self = targetId === req.auth.userId;
  if (!self && !canManageGroup(req.auth, membership)) throw new ChatError(403, 'Only group admins can remove members.');
  const ownerId = await ensureOwnerUser();
  if (targetId === ownerId || targetId === membership.created_by) {
    throw new ChatError(403, 'The group owner cannot be removed.');
  }
  const [[target]] = await getPool().query('SELECT display_name FROM chat_users WHERE id = ?', [targetId]);
  if (!target) throw new ChatError(404, 'Member not found.');
  // System message first, while the target is still a member and can see it.
  await systemMessage(id, req.auth, self ? `${req.auth.name} left the group` : `${req.auth.name} removed ${target.display_name}`);
  const removed = await removeMember(id, targetId);
  if (!removed) throw new ChatError(404, 'Member not found.');
  emitToUsers([targetId], 'conversation:removed', { conversationId: id });
  await emitToConversation(id, 'conversation:updated', { conversationId: id });
  await audit(req.auth.userId, self ? 'group.leave' : 'group.members.remove', 'conversation', id, `user=${targetId}`);
  res.json({ ok: true });
});

// POST /api/chat/conversations/:id/report  { reason }
export const postReport = handle(async (req, res) => {
  const id = idParam(req);
  await requireMembership(id, req.auth.userId);
  const reason = clean(String(req.body?.reason || ''), { multiline: true }).slice(0, 500);
  if (reason.length < 3) throw new ChatError(422, 'Please describe the problem.');
  await getPool().query('INSERT INTO chat_reports (conversation_id, reporter_id, reason) VALUES (?, ?, ?)', [
    id,
    req.auth.userId,
    reason,
  ]);
  await audit(req.auth.userId, 'conversation.report', 'conversation', id);
  res.status(201).json({ ok: true, message: 'Thanks — the report was recorded.' });
});
