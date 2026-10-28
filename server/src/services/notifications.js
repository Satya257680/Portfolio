// Decides who gets an email for a new chat message or contact-form submission.
import { config } from '../config.js';
import { activeMembers } from './chat.service.js';
import { sendEmailInBackground } from './email/mailer.js';
import {
  ownerChatNotification,
  ownerContactNotification,
  visitorContactReceipt,
  visitorReplyNotification,
} from './email/templates.js';
import { isUserOnline } from './realtime.js';

const lastNotified = new Map(); // `${conversationId}:${recipientId}` -> epoch ms

function cooldownPassed(key) {
  const now = Date.now();
  const prev = lastNotified.get(key) || 0;
  if (now - prev < config.chat.notifyCooldownSec * 1000) return false;
  lastNotified.set(key, now);
  // Keep the map bounded.
  if (lastNotified.size > 5000) {
    for (const [k, t] of lastNotified) if (now - t > 3600_000) lastNotified.delete(k);
  }
  return true;
}

export function resetNotificationCooldowns() {
  lastNotified.clear();
}

/**
 * Emails conversation members about a new message:
 *  - the owner (satyajit.it.2026@gmail.com) for every visitor message (rate-limited per conversation);
 *  - visitors when someone else writes and they are not connected (and the chat is not muted).
 * Runs in the background: the message is already saved, so email problems never lose it.
 */
export async function notifyNewMessage({ conversation, message, sender }) {
  if (message.type !== 'text') return;
  let members;
  try {
    members = await activeMembers(conversation.id);
  } catch (err) {
    console.error('[notify] could not load members:', err.code || err.name);
    return;
  }
  const isGroup = conversation.type === 'group';
  const now = Date.now();
  for (const m of members) {
    if (m.id === sender.userId) continue;
    const key = `${conversation.id}:${m.id}`;
    if (m.is_owner) {
      if (!cooldownPassed(key)) continue;
      const tpl = ownerChatNotification({
        visitorName: sender.name,
        visitorEmail: sender.email,
        conversationTitle: conversation.title,
        isGroup,
        message: message.body,
        sentAt: message.createdAt,
        conversationId: conversation.id,
      });
      sendEmailInBackground({
        kind: 'chat_owner_notification',
        to: config.owner.email,
        replyTo: sender.email,
        relatedType: 'chat_message',
        relatedId: message.id,
        idempotencyKey: `chat-owner-${message.id}`,
        ...tpl,
      });
    } else {
      const muted = m.muted_until && new Date(m.muted_until).getTime() > now;
      if (muted || isUserOnline(m.id) || !cooldownPassed(key)) continue;
      const tpl = visitorReplyNotification({
        recipientName: m.display_name,
        senderName: sender.name,
        conversationTitle: conversation.title,
        isGroup,
        message: message.body,
        sentAt: message.createdAt,
      });
      sendEmailInBackground({
        kind: 'chat_reply_notification',
        to: m.email,
        replyTo: sender.isOwner ? config.owner.email : undefined,
        relatedType: 'chat_message',
        relatedId: message.id,
        idempotencyKey: `chat-reply-${message.id}-${m.id}`,
        ...tpl,
      });
    }
  }
}

export function notifyContactMessage({ id, name, email, subject, message }) {
  const sentAt = new Date();
  sendEmailInBackground({
    kind: 'contact_owner_notification',
    to: config.owner.email,
    replyTo: email,
    relatedType: 'contact_message',
    relatedId: id,
    idempotencyKey: `contact-owner-${id}`,
    ...ownerContactNotification({ id, name, email, subject, message, sentAt }),
  });
  if (config.email.sendContactReceipt) {
    sendEmailInBackground({
      kind: 'contact_visitor_receipt',
      to: email,
      replyTo: config.owner.email,
      relatedType: 'contact_message',
      relatedId: id,
      idempotencyKey: `contact-receipt-${id}`,
      ...visitorContactReceipt({ name, subject }),
    });
  }
}
