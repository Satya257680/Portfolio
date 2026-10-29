import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES, checkAttachment, formatBytes, isTooLargeError } from './attachments.js';

const file = (size, name = 'report.pdf', type = 'application/pdf') => ({ size, name, type });

describe('checkAttachment — 10 MB or smaller', () => {
  it('uses exactly 10 MiB as the limit (same as the server)', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
  });

  it('accepts a file exactly at the limit and just under it', () => {
    expect(checkAttachment(file(MAX_ATTACHMENT_BYTES))).toEqual({ ok: true });
    expect(checkAttachment(file(MAX_ATTACHMENT_BYTES - 1))).toEqual({ ok: true });
    expect(checkAttachment(file(1))).toEqual({ ok: true });
  });

  it('rejects one byte over the limit as too large', () => {
    expect(checkAttachment(file(MAX_ATTACHMENT_BYTES + 1))).toEqual({ ok: false, reason: 'too_large' });
    expect(checkAttachment(file(50 * 1024 * 1024))).toMatchObject({ reason: 'too_large' });
  });

  it('reports other problems with their own reason (never "too_large")', () => {
    expect(checkAttachment(file(0))).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkAttachment(file(100, 'clip.MP4', ''))).toMatchObject({ ok: false, reason: 'type' });
    expect(checkAttachment(file(100, 'movie', 'video/webm'))).toMatchObject({ ok: false, reason: 'type' });
    expect(checkAttachment(file(100, 'setup.exe', 'application/octet-stream'))).toMatchObject({ reason: 'type' });
    expect(checkAttachment(null)).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('checks size before type so an oversized video still explains the size limit', () => {
    expect(checkAttachment(file(MAX_ATTACHMENT_BYTES + 1, 'clip.mp4', 'video/mp4'))).toMatchObject({ reason: 'too_large' });
  });
});

describe('isTooLargeError', () => {
  it('matches only the server size error code', () => {
    expect(isTooLargeError({ status: 413, code: 'ATTACHMENT_TOO_LARGE' })).toBe(true);
    expect(isTooLargeError({ status: 413, code: null })).toBe(false);
    expect(isTooLargeError({ status: 415 })).toBe(false);
    expect(isTooLargeError({ status: 0, code: 'NETWORK' })).toBe(false);
    expect(isTooLargeError(undefined)).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats attachment sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1457 * 1024)).toBe('1.4 MB');
    expect(formatBytes(20 * 1024)).toBe('20 KB');
    expect(formatBytes(MAX_ATTACHMENT_BYTES)).toBe('10 MB');
  });
});
