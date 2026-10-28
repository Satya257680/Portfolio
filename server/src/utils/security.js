import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// High-entropy opaque token (session / access link). Only its SHA-256 hash is stored.
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// 6-digit numeric verification code, uniformly random.
export function randomCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Codes are short, so bind the hash to the email to stop cross-account reuse.
export function hashCode(email, code) {
  return sha256(`${String(email).toLowerCase()}:${String(code)}`);
}

export function safeEqualHex(a, b) {
  const ab = Buffer.from(String(a), 'hex');
  const bb = Buffer.from(String(b), 'hex');
  return ab.length === bb.length && ab.length > 0 && crypto.timingSafeEqual(ab, bb);
}

// Password hashing with scrypt (memory-hard, built into Node.js — no native dependency).
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password).normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [alg, n, r, p, saltB64, keyB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(String(password).normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// A fixed hash used to keep login timing similar when the email is unknown.
let dummyHash = null;
export async function dummyPasswordCheck(password) {
  if (!dummyHash) dummyHash = await hashPassword(randomToken(12));
  await verifyPassword(password, dummyHash);
  return false;
}
