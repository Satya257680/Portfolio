// Data access for conversations, members and messages. Every query is parameterised.
import { getPool } from '../db.js';
import { isUserOnline } from './realtime.js';

export class ChatError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const likeEscape = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);

export function toMessage(r) {
  return {
    id: Number(r.id),
    conversationId: Number(r.conversation_id),
    senderId: Number(r.sender_id),
    senderName: r.sender_name,
    body: r.body,
    type: r.message_type,
    clientMessageId: r.client_message_id || null,
    createdAt: r.created_at,
    ...(r.attachment_id ? { attachment: { id: Number(r.attachment_id), name: r.attachment_name, mimeType: r.attachment_mime, size: Number(r.attachment_size) } } : {}),
  };
}

const MESSAGE_SELECT = `
  SELECT msg.id, msg.conversation_id, msg.sender_id, u.display_name AS sender_name, msg.body,
         msg.message_type, msg.client_message_id, msg.created_at,
         att.id AS attachment_id, att.file_name AS attachment_name, att.mime_type AS attachment_mime, att.file_size AS attachment_size
  FROM chat_messages msg
  JOIN chat_users u ON u.id = msg.sender_id
  LEFT JOIN chat_attachments att ON att.message_id = msg.id`;

// Active membership + conversation, or null when the user is not (or no longer) a member.
export async function getMembership(conversationId, userId) {
  const [rows] = await getPool().query(
    `SELECT c.id, c.type, c.title, c.description, c.status, c.created_by, c.last_message_id,
            m.role, m.last_read_message_id, m.muted_until
     FROM chat_conversation_members m
     JOIN chat_conversations c ON c.id = m.conversation_id
     WHERE m.conversation_id = ? AND m.user_id = ? AND m.left_at IS NULL
     LIMIT 1`,
    [conversationId, userId],
  );
  return rows[0] || null;
}

export async function requireMembership(conversationId, userId) {
  const m = await getMembership(conversationId, userId);
  // Same 404 whether the conversation does not exist or belongs to someone else (no enumeration).
  if (!m) throw new ChatError(404, 'Conversation not found.');
  return m;
}

export async function listConversations(userId, { filter = 'all', type = null, q = '', isAdmin = false } = {}) {
  const where = ['m.user_id = ?', 'm.left_at IS NULL'];
  const params = [userId];
  if (isAdmin) {
    if (filter === 'archived') where.push("c.status = 'archived'");
    else where.push("c.status <> 'archived'");
  }
  if (filter === 'groups') where.push("c.type = 'group'");
  if (type === 'direct' || type === 'group') {
    where.push('c.type = ?');
    params.push(type);
  }
  if (q) {
    const like = `%${likeEscape(q.slice(0, 80))}%`;
    where.push('(c.title LIKE ? OR ou.display_name LIKE ? OR ou.email LIKE ?)');
    params.push(like, like, like);
  }
  const having = filter === 'unread' ? 'HAVING unread > 0' : '';
  const [rows] = await getPool().query(
    `SELECT c.id, c.type, c.title, c.description, c.status, c.last_message_at, c.created_at,
            m.role, m.last_read_message_id, m.muted_until,
            lm.id AS lm_id, lm.body AS lm_body, lm.sender_id AS lm_sender_id, lm.message_type AS lm_type,
            lm.created_at AS lm_created_at, lu.display_name AS lm_sender_name,
            ou.id AS other_id, ou.display_name AS other_name, ou.email AS other_email,
            ou.status AS other_status, ou.is_owner AS other_is_owner,
            (SELECT COUNT(*) FROM chat_conversation_members cm
              WHERE cm.conversation_id = c.id AND cm.left_at IS NULL) AS member_count,
            (SELECT COUNT(*) FROM chat_messages x
              WHERE x.conversation_id = c.id AND x.id > m.last_read_message_id
                AND x.sender_id <> m.user_id AND x.deleted_at IS NULL) AS unread
     FROM chat_conversation_members m
     JOIN chat_conversations c ON c.id = m.conversation_id
     LEFT JOIN chat_messages lm ON lm.id = c.last_message_id
     LEFT JOIN chat_users lu ON lu.id = lm.sender_id
     LEFT JOIN chat_conversation_members om
            ON c.type = 'direct' AND om.conversation_id = c.id AND om.user_id <> m.user_id
     LEFT JOIN chat_users ou ON ou.id = om.user_id
     WHERE ${where.join(' AND ')}
     ${having}
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
     LIMIT 200`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.type === 'group' ? r.title : r.other_name || 'Conversation',
    description: r.description,
    status: r.status,
    role: r.role,
    memberCount: Number(r.member_count),
    unread: Number(r.unread),
    mutedUntil: r.muted_until,
    lastActivityAt: r.last_message_at || r.created_at,
    lastMessage: r.lm_id
      ? {
          id: Number(r.lm_id),
          body: r.lm_body.slice(0, 160),
          senderId: r.lm_sender_id,
          senderName: r.lm_sender_name,
          type: r.lm_type,
          createdAt: r.lm_created_at,
        }
      : null,
    other: r.other_id
      ? {
          id: r.other_id,
          name: r.other_name,
          isOwner: Boolean(r.other_is_owner),
          online: isUserOnline(r.other_id),
          // Visitor emails and block state are only exposed to the admin.
          ...(isAdmin ? { email: r.other_email, status: r.other_status } : {}),
        }
      : null,
  }));
}

export async function getConversationDetail(conversationId, userId, { isAdmin = false } = {}) {
  const conv = await requireMembership(conversationId, userId);
  const [members] = await getPool().query(
    `SELECT u.id, u.display_name, u.email, u.is_owner, u.status, u.email_verified_at, m.role, m.last_read_message_id
     FROM chat_conversation_members m
     JOIN chat_users u ON u.id = m.user_id
     WHERE m.conversation_id = ? AND m.left_at IS NULL
     ORDER BY u.is_owner DESC, m.role = 'admin' DESC, u.display_name`,
    [conversationId],
  );
  const others = members.filter((m) => m.id !== userId);
  const other = conv.type === 'direct' ? others[0] : null;
  return {
    id: conv.id,
    type: conv.type,
    title: conv.type === 'group' ? conv.title : other?.display_name || 'Conversation',
    description: conv.description,
    status: conv.status,
    role: conv.role,
    mutedUntil: conv.muted_until,
    lastReadMessageId: Number(conv.last_read_message_id),
    members: members.map((m) => ({
      id: m.id,
      name: m.display_name,
      role: m.role,
      isOwner: Boolean(m.is_owner),
      online: isUserOnline(m.id),
      lastReadMessageId: Number(m.last_read_message_id),
      ...(isAdmin ? { email: m.email, status: m.status, verified: Boolean(m.email_verified_at) } : {}),
    })),
  };
}

export async function listMessages(conversationId, { before = null, limit = 40 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const params = [conversationId];
  let extra = '';
  if (before) {
    extra = 'AND msg.id < ?';
    params.push(before);
  }
  params.push(lim + 1);
  const [rows] = await getPool().query(
    `${MESSAGE_SELECT}
     WHERE msg.conversation_id = ? AND msg.deleted_at IS NULL ${extra}
     ORDER BY msg.id DESC
     LIMIT ?`,
    params,
  );
  const hasMore = rows.length > lim;
  return { messages: rows.slice(0, lim).reverse().map(toMessage), hasMore };
}

async function fetchMessage(conn, id) {
  const [rows] = await conn.query(`${MESSAGE_SELECT} WHERE msg.id = ?`, [id]);
  return rows[0] ? toMessage(rows[0]) : null;
}

/**
 * Stores a message exactly once per (sender, clientMessageId) and updates the conversation.
 * Returns { message, duplicate }.
 */
export async function createMessage({ conversationId, senderId, body, clientMessageId = null, type = 'text', reopen = false }) {
  const pool = getPool();
  if (clientMessageId) {
    const [dup] = await pool.query(
      'SELECT id FROM chat_messages WHERE sender_id = ? AND client_message_id = ? LIMIT 1',
      [senderId, clientMessageId],
    );
    if (dup.length) return { message: await fetchMessage(pool, dup[0].id), duplicate: true };
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let id;
    try {
      const [r] = await conn.query(
        `INSERT INTO chat_messages (conversation_id, sender_id, body, message_type, client_message_id)
         VALUES (?, ?, ?, ?, ?)`,
        [conversationId, senderId, body, type, clientMessageId],
      );
      id = r.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' && clientMessageId) {
        await conn.rollback();
        const [dup] = await pool.query(
          'SELECT id FROM chat_messages WHERE sender_id = ? AND client_message_id = ? LIMIT 1',
          [senderId, clientMessageId],
        );
        return { message: await fetchMessage(pool, dup[0].id), duplicate: true };
      }
      throw err;
    }
    await conn.query(
      `UPDATE chat_conversations
       SET last_message_id = ?, last_message_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
           ${reopen ? ", status = IF(status = 'archived', 'open', status)" : ''}
       WHERE id = ?`,
      [id, conversationId],
    );
    // The sender has obviously read their own message.
    await conn.query(
      `UPDATE chat_conversation_members SET last_read_message_id = GREATEST(last_read_message_id, ?)
       WHERE conversation_id = ? AND user_id = ?`,
      [id, conversationId, senderId],
    );
    await conn.commit();
    return { message: await fetchMessage(pool, id), duplicate: false };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export async function markRead(conversationId, userId, upTo = null) {
  const pool = getPool();
  const [[{ maxId }]] = await pool.query(
    'SELECT COALESCE(MAX(id), 0) AS maxId FROM chat_messages WHERE conversation_id = ?',
    [conversationId],
  );
  const target = upTo ? Math.min(Number(upTo), Number(maxId)) : Number(maxId);
  await pool.query(
    `UPDATE chat_conversation_members SET last_read_message_id = GREATEST(last_read_message_id, ?)
     WHERE conversation_id = ? AND user_id = ?`,
    [target, conversationId, userId],
  );
  const [[row]] = await pool.query(
    'SELECT last_read_message_id FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
    [conversationId, userId],
  );
  return Number(row.last_read_message_id);
}

export async function markUnread(conversationId, userId) {
  const pool = getPool();
  const [[{ prevId }]] = await pool.query(
    `SELECT COALESCE(MAX(x.id), 0) AS prevId FROM chat_messages x
     WHERE x.conversation_id = ? AND x.sender_id <> ? AND x.deleted_at IS NULL
       AND x.id < (SELECT COALESCE(MAX(y.id), 0) FROM chat_messages y
                   WHERE y.conversation_id = ? AND y.sender_id <> ? AND y.deleted_at IS NULL)`,
    [conversationId, userId, conversationId, userId],
  );
  await pool.query(
    'UPDATE chat_conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?',
    [prevId, conversationId, userId],
  );
}

// Get or create the private 1-to-1 conversation between two users (race-safe via unique direct_key).
export async function getOrCreateDirect(userA, userB) {
  const [a, b] = [Number(userA), Number(userB)].sort((x, y) => x - y);
  const key = `${a}:${b}`;
  const pool = getPool();
  const [found] = await pool.query('SELECT id FROM chat_conversations WHERE direct_key = ? LIMIT 1', [key]);
  if (found.length) {
    // Re-activate memberships in case they were ever left.
    await pool.query(
      'UPDATE chat_conversation_members SET left_at = NULL WHERE conversation_id = ? AND user_id IN (?, ?)',
      [found[0].id, a, b],
    );
    return found[0].id;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      "INSERT INTO chat_conversations (type, direct_key, created_by) VALUES ('direct', ?, ?)",
      [key, userA],
    );
    await conn.query(
      'INSERT INTO chat_conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?), (?, ?, ?)',
      [r.insertId, a, 'member', r.insertId, b, 'member'],
    );
    await conn.commit();
    return r.insertId;
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err.code === 'ER_DUP_ENTRY') {
      const [again] = await pool.query('SELECT id FROM chat_conversations WHERE direct_key = ? LIMIT 1', [key]);
      if (again.length) return again[0].id;
    }
    throw err;
  } finally {
    conn.release();
  }
}

// Looks up verified, active, non-owner chat users by email. Returns { users, missing }.
export async function findVerifiedUsersByEmail(emails) {
  if (!emails.length) return { users: [], missing: [] };
  const [rows] = await getPool().query(
    `SELECT id, display_name, email FROM chat_users
     WHERE email IN (?) AND email_verified_at IS NOT NULL AND status = 'active' AND is_owner = 0`,
    [emails],
  );
  const found = new Set(rows.map((r) => r.email));
  return { users: rows, missing: emails.filter((e) => !found.has(e)) };
}

export async function createGroup({ creatorId, title, description, memberIds }) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      "INSERT INTO chat_conversations (type, title, description, created_by) VALUES ('group', ?, ?, ?)",
      [title, description || null, creatorId],
    );
    const values = [[r.insertId, creatorId, 'admin']];
    for (const id of memberIds) if (id !== creatorId) values.push([r.insertId, id, 'member']);
    await conn.query('INSERT INTO chat_conversation_members (conversation_id, user_id, role) VALUES ?', [values]);
    await conn.commit();
    return r.insertId;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export async function addMembers(conversationId, userIds) {
  const pool = getPool();
  const [[conv]] = await pool.query('SELECT COALESCE(last_message_id, 0) AS lastId FROM chat_conversations WHERE id = ?', [
    conversationId,
  ]);
  const [current] = userIds.length
    ? await pool.query(
        'SELECT user_id FROM chat_conversation_members WHERE conversation_id = ? AND left_at IS NULL AND user_id IN (?)',
        [conversationId, userIds],
      )
    : [[]];
  const already = new Set(current.map((r) => r.user_id));
  const added = [];
  for (const uid of userIds) {
    if (already.has(uid)) continue;
    await pool.query(
      `INSERT INTO chat_conversation_members (conversation_id, user_id, role, last_read_message_id)
       VALUES (?, ?, 'member', ?)
       ON DUPLICATE KEY UPDATE
         joined_at = IF(left_at IS NULL, joined_at, UTC_TIMESTAMP()),
         last_read_message_id = IF(left_at IS NULL, last_read_message_id, VALUES(last_read_message_id)),
         left_at = NULL`,
      [conversationId, uid, conv.lastId],
    );
    added.push(uid);
  }
  return added;
}

export async function removeMember(conversationId, userId) {
  const [r] = await getPool().query(
    'UPDATE chat_conversation_members SET left_at = UTC_TIMESTAMP() WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL',
    [conversationId, userId],
  );
  return r.affectedRows > 0;
}

export async function updateGroup(conversationId, { title, description }) {
  const sets = [];
  const params = [];
  if (title !== undefined) {
    sets.push('title = ?');
    params.push(title);
  }
  if (description !== undefined) {
    sets.push('description = ?');
    params.push(description || null);
  }
  if (!sets.length) return;
  params.push(conversationId);
  await getPool().query(`UPDATE chat_conversations SET ${sets.join(', ')}, updated_at = UTC_TIMESTAMP() WHERE id = ?`, params);
}

export async function activeMembers(conversationId) {
  const [rows] = await getPool().query(
    `SELECT u.id, u.display_name, u.email, u.is_owner, m.muted_until
     FROM chat_conversation_members m JOIN chat_users u ON u.id = m.user_id
     WHERE m.conversation_id = ? AND m.left_at IS NULL AND u.status = 'active'`,
    [conversationId],
  );
  return rows;
}
