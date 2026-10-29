// HTML + plain-text email templates. All user-supplied values are HTML-escaped.
import { config } from '../../config.js';

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const nl2br = (s) => esc(s).replace(/\r?\n/g, '<br>');

export function formatTime(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: config.email.timeZone,
    })
      .format(new Date(date))
      .replace(/\bam\b/, 'AM')
      .replace(/\bpm\b/, 'PM');
  } catch {
    return new Date(date).toUTCString();
  }
}

export function preview(text, max = config.chat.emailPreviewChars) {
  const t = String(text || '').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const button = (href, label, primary = true) => `
  <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;border-radius:10px;font:600 15px/1.2 Segoe UI,Roboto,Arial,sans-serif;text-decoration:none;${
    primary ? 'background:#1a73e8;color:#ffffff;border:1px solid #1a73e8;' : 'background:#ffffff;color:#1a73e8;border:1px solid #c6d4f5;'
  }">${esc(label)}</a>`;

function layout({ heading, bodyHtml, footer }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#eef3fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#f4f7fd;border:1px solid #dfe7f5;border-radius:14px;">
        <tr><td style="padding:22px 24px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:38px;height:38px;background:#1a73e8;border-radius:10px;text-align:center;vertical-align:middle;color:#fff;font:700 18px Arial,sans-serif;">&#128172;</td>
            <td style="padding-left:12px;font:600 19px/1.3 Segoe UI,Roboto,Arial,sans-serif;color:#1f2a44;">${esc(heading)}</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:12px 24px 8px;">${bodyHtml}</td></tr>
        <tr><td style="padding:6px 24px 22px;font:12px/1.5 Segoe UI,Roboto,Arial,sans-serif;color:#6b7690;text-align:center;">${esc(footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const detailRows = (rows) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9effa;border-radius:10px;padding:14px 16px;font:14px/1.55 Segoe UI,Roboto,Arial,sans-serif;color:#1f2a44;">
    ${rows
      .filter(Boolean)
      .map(
        ([label, valueHtml]) => `<tr>
          <td style="padding:5px 12px 5px 0;vertical-align:top;font-weight:600;white-space:nowrap;width:80px;">${esc(label)}:</td>
          <td style="padding:5px 0;vertical-align:top;color:#33405e;">${valueHtml}</td>
        </tr>`,
      )
      .join('')}
  </table>`;

const buttons = (...btns) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr>
    ${btns.filter(Boolean).map((b) => `<td style="padding-right:10px;">${b}</td>`).join('')}
  </tr></table>`;

// 1) Owner notification for a new visitor chat message (matches the portfolio design mock-up).
export function ownerChatNotification({ visitorName, visitorEmail, conversationTitle, isGroup, message, sentAt, conversationId }) {
  const openUrl = `${config.appBaseUrl}/admin?c=${encodeURIComponent(conversationId)}`;
  const includeMsg = config.chat.emailIncludeMessage;
  const text = preview(message);
  const subject = isGroup ? `New message in ${conversationTitle} from ${visitorName}` : `New message from ${visitorName}`;
  const replySubject = encodeURIComponent('Re: Your message on my Portfolio Chat');
  const bodyHtml = `
    ${detailRows([
      ['From', esc(visitorName)],
      ['Email', `<a href="mailto:${esc(visitorEmail)}" style="color:#1a73e8;text-decoration:none;">${esc(visitorEmail)}</a>`],
      isGroup ? ['Group', esc(conversationTitle)] : null,
      ['Time', esc(formatTime(sentAt))],
      includeMsg ? ['Message', nl2br(text)] : ['Message', '<em>Open the chat to read the message.</em>'],
    ])}
    ${buttons(button(openUrl, 'Open Chat'), button(`mailto:${visitorEmail}?subject=${replySubject}`, 'Reply via Email', false))}`;
  return {
    subject,
    html: layout({
      heading: 'You have a new message on your Portfolio Chat',
      bodyHtml,
      footer: 'This is an automated notification from your portfolio chat system.',
    }),
    text: [
      'You have a new message on your Portfolio Chat',
      '',
      `From: ${visitorName}`,
      `Email: ${visitorEmail}`,
      isGroup ? `Group: ${conversationTitle}` : null,
      `Time: ${formatTime(sentAt)}`,
      includeMsg ? `Message: ${text}` : 'Open the chat to read the message.',
      '',
      `Open chat: ${openUrl}`,
    ]
      .filter((l) => l !== null)
      .join('\n'),
  };
}

// 2) Visitor notification when the owner (or a group member) replies.
export function visitorReplyNotification({ recipientName, senderName, conversationTitle, isGroup, message, sentAt }) {
  const openUrl = `${config.appBaseUrl}/chat`;
  const includeMsg = config.chat.emailIncludeMessage;
  const text = preview(message);
  const subject = isGroup ? `New message in ${conversationTitle}` : `Re: Your message on my Portfolio Chat`;
  const bodyHtml = `
    <p style="margin:0 0 14px;font:15px/1.6 Segoe UI,Roboto,Arial,sans-serif;color:#1f2a44;">Hi ${esc(recipientName)},</p>
    <p style="margin:0 0 14px;font:15px/1.6 Segoe UI,Roboto,Arial,sans-serif;color:#1f2a44;">
      ${esc(senderName)} replied ${isGroup ? `in <strong>${esc(conversationTitle)}</strong>` : 'to your message on the portfolio chat'}.
    </p>
    ${detailRows([
      ['From', esc(senderName)],
      ['Time', esc(formatTime(sentAt))],
      includeMsg ? ['Message', nl2br(text)] : null,
    ])}
    ${buttons(button(openUrl, 'Open Chat'))}`;
  return {
    subject,
    html: layout({
      heading: isGroup ? `New message in ${conversationTitle}` : 'You have a reply on the Portfolio Chat',
      bodyHtml,
      footer: 'You received this because you started a verified conversation on satyajitnayak-portfolio. Sign in with the same email to continue.',
    }),
    text: [
      `Hi ${recipientName},`,
      '',
      `${senderName} replied${isGroup ? ` in ${conversationTitle}` : ''}.`,
      includeMsg ? `Message: ${text}` : null,
      '',
      `Open chat: ${openUrl}`,
    ]
      .filter((l) => l !== null)
      .join('\n'),
  };
}

// 3) Verification code for starting / resuming a chat.
export function verificationEmail({ name, email, code, ttlMinutes }) {
  const link = `${config.appBaseUrl}/chat#verify=${encodeURIComponent(Buffer.from(`${email}:${code}`).toString('base64url'))}`;
  const bodyHtml = `
    <p style="margin:0 0 14px;font:15px/1.6 Segoe UI,Roboto,Arial,sans-serif;color:#1f2a44;">Hi ${esc(name)},</p>
    <p style="margin:0 0 14px;font:15px/1.6 Segoe UI,Roboto,Arial,sans-serif;color:#1f2a44;">Use this code to verify your email and open your private chat with ${esc(config.owner.name)}:</p>
    <div style="margin:6px 0 16px;padding:14px;background:#e9effa;border-radius:10px;text-align:center;font:700 30px/1.2 Consolas,Menlo,monospace;letter-spacing:8px;color:#1f2a44;">${esc(code)}</div>
    <p style="margin:0 0 6px;font:14px/1.6 Segoe UI,Roboto,Arial,sans-serif;color:#33405e;">The code expires in ${esc(ttlMinutes)} minutes and can be used once. Or open the chat directly:</p>
    ${buttons(button(link, 'Verify & Open Chat'))}`;
  return {
    subject: `${code} is your Portfolio Chat verification code`,
    html: layout({
      heading: 'Verify your email for Portfolio Chat',
      bodyHtml,
      footer: "If you didn't request this, you can ignore this email — no chat will be opened.",
    }),
    text: `Hi ${name},\n\nYour Portfolio Chat verification code is ${code}. It expires in ${ttlMinutes} minutes.\n\nOpen the chat: ${link}\n\nIf you didn't request this, ignore this email.`,
  };
}

// 3b) Admin password-reset code. Its own wording (the chat verification email talks about opening a
// chat), and the code is never placed in a URL — the admin types it on the /admin reset screen.
export function adminPasswordResetEmail({ code, ttlMinutes }) {
  const adminUrl = `${config.appBaseUrl}/admin`;
  const bodyHtml = `
    <p style="margin:0 0 14px;font:15px/1.6 Segoe UI,Roboto,Arial,sans-serif;color:#1f2a44;">A password reset was requested for the Portfolio Chat admin account.</p>
    <p style="margin:0 0 14px;font:15px/1.6 Segoe UI,Roboto,Arial,sans-serif;color:#1f2a44;">Enter this code on the admin reset screen:</p>
    <div style="margin:6px 0 16px;padding:14px;background:#e9effa;border-radius:10px;text-align:center;font:700 30px/1.2 Consolas,Menlo,monospace;letter-spacing:8px;color:#1f2a44;">${esc(code)}</div>
    <p style="margin:0 0 6px;font:14px/1.6 Segoe UI,Roboto,Arial,sans-serif;color:#33405e;">The code expires in ${esc(ttlMinutes)} minutes and can be used once. Requesting another code replaces this one.</p>
    ${buttons(button(adminUrl, 'Open admin sign-in'))}`;
  return {
    subject: `${code} is your Portfolio admin password reset code`,
    html: layout({
      heading: 'Reset your admin password',
      bodyHtml,
      footer: "If you didn't request this, ignore this email — your password stays the same.",
    }),
    text: `A password reset was requested for the Portfolio Chat admin account.\n\nYour reset code is ${code}. It expires in ${ttlMinutes} minutes and can be used once.\n\nAdmin sign-in: ${adminUrl}\n\nIf you didn't request this, ignore this email — your password stays the same.`,
  };
}

// 4) Owner notification for a contact-form submission.
export function ownerContactNotification({ id, name, email, subject, message, sentAt }) {
  const replySubject = encodeURIComponent(`Re: ${subject || 'Your message'}`);
  const bodyHtml = `
    ${detailRows([
      ['From', esc(name)],
      ['Email', `<a href="mailto:${esc(email)}" style="color:#1a73e8;text-decoration:none;">${esc(email)}</a>`],
      ['Subject', esc(subject || '(no subject)')],
      ['Time', esc(formatTime(sentAt))],
      ['Message', nl2br(message)],
    ])}
    ${buttons(button(`mailto:${email}?subject=${replySubject}`, 'Reply via Email'), button(`${config.appBaseUrl}/admin?view=contact`, 'Open Inbox', false))}`;
  return {
    subject: `New contact message from ${name}${subject ? ` — ${subject}` : ''}`,
    html: layout({
      heading: 'New message from your portfolio contact form',
      bodyHtml,
      footer: `Contact message #${id}. This is an automated notification from your portfolio.`,
    }),
    text: `New contact message from ${name} <${email}>\nSubject: ${subject || '(no subject)'}\nTime: ${formatTime(sentAt)}\n\n${message}`,
  };
}

// 5) Receipt to the visitor after the contact form message has been stored.
export function visitorContactReceipt({ name, subject }) {
  const bodyHtml = `
    <p style="margin:0 0 14px;font:15px/1.6 Segoe UI,Roboto,Arial,sans-serif;color:#1f2a44;">Hi ${esc(name)},</p>
    <p style="margin:0 0 14px;font:15px/1.6 Segoe UI,Roboto,Arial,sans-serif;color:#1f2a44;">
      Thanks for reaching out through my portfolio. Your message${subject ? ` about <strong>${esc(subject)}</strong>` : ''} was received and I usually reply within 24 hours.
    </p>
    <p style="margin:0;font:15px/1.6 Segoe UI,Roboto,Arial,sans-serif;color:#1f2a44;">Best regards,<br>${esc(config.owner.name)}</p>`;
  return {
    subject: 'Thanks for your message — Satyajit Nayak',
    html: layout({
      heading: 'Your message was received',
      bodyHtml,
      footer: "You received this because this address was entered on the portfolio contact form. If that wasn't you, ignore this email.",
    }),
    text: `Hi ${name},\n\nThanks for reaching out through my portfolio. Your message was received and I usually reply within 24 hours.\n\nBest regards,\n${config.owner.name}`,
  };
}
