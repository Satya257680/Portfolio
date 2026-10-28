import { describe, expect, it } from 'vitest';
import { ownerChatNotification, verificationEmail } from '../src/services/email/templates.js';
import { hashCode, hashPassword, randomCode, safeEqualHex, verifyPassword } from '../src/utils/security.js';
import { parseId, validateGroup, validateMessage, validateVerifyCode } from '../src/validators/chat.validator.js';

describe('security utils', () => {
  it('hashes and verifies passwords with scrypt', async () => {
    const h = await hashPassword('a-very-long-password');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('a-very-long-password', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('creates 6-digit codes bound to the email', () => {
    const code = randomCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(hashCode('a@x.com', code)).not.toBe(hashCode('b@x.com', code));
    expect(safeEqualHex(hashCode('A@x.com', code), hashCode('a@x.com', code))).toBe(true);
  });
});

describe('validators', () => {
  it('validates messages', () => {
    expect(validateMessage({ body: '  hi  ' }).data.body).toBe('hi');
    expect(validateMessage({ body: '' }).valid).toBe(false);
    expect(validateMessage({ body: 'x', clientMessageId: 'bad id!' }).valid).toBe(false);
    expect(validateMessage({ body: 'x'.repeat(5000) }).valid).toBe(false);
  });

  it('validates codes, groups and ids', () => {
    expect(validateVerifyCode({ email: 'a@b.co', code: '12 34 56' }).valid).toBe(true);
    expect(validateVerifyCode({ email: 'a@b.co', code: '12345' }).valid).toBe(false);
    expect(validateGroup({ title: 'G', memberEmails: [] }).valid).toBe(false);
    expect(validateGroup({ title: 'Group', memberEmails: ['A@B.co', 'a@b.co'] }).data.memberEmails).toEqual(['a@b.co']);
    expect(parseId('12')).toBe(12);
    expect(parseId('12abc')).toBe(null);
    expect(parseId('-1')).toBe(null);
  });
});

describe('email templates', () => {
  it('escapes visitor content in the owner notification', () => {
    const t = ownerChatNotification({
      visitorName: '<img src=x onerror=alert(1)>',
      visitorEmail: 'priya.reddy@example.com',
      conversationTitle: 'x',
      isGroup: false,
      message: '<script>alert(1)</script>',
      sentAt: new Date('2026-10-28T04:54:00Z'),
      conversationId: 7,
    });
    expect(t.subject).toContain('New message from');
    expect(t.html).not.toContain('<script>');
    expect(t.html).not.toContain('<img src=x');
    expect(t.html).toContain('Open Chat');
    expect(t.html).toContain('Reply via Email');
    expect(t.html).toContain('/admin?c=7');
    expect(t.text).toContain('28 Oct 2026');
  });

  it('includes the code and a verify link', () => {
    const t = verificationEmail({ name: 'Priya', email: 'p@example.com', code: '123456', ttlMinutes: 10 });
    expect(t.subject).toContain('123456');
    expect(t.html).toContain('/chat#verify=');
  });
});
