import { ADMIN_TOKEN_KEY, tokenStore } from '../lib/api.js';

// Remembers (in this browser only) that the owner has signed in to the admin panel here, so the
// portfolio can show its small lock button on the owner's own devices. This is a convenience for
// the owner, NOT a security boundary: /admin and every /api/admin endpoint are protected on the server.
const DEVICE_KEY = 'sn-admin-device';

export function markAdminDevice() {
  tokenStore.set(DEVICE_KEY, '1');
}

export function isAdminDevice() {
  return tokenStore.get(DEVICE_KEY) === '1' || Boolean(tokenStore.get(ADMIN_TOKEN_KEY));
}
