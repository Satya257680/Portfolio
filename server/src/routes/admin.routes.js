import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as admin from '../controllers/admin.controller.js';
import { requireAdmin } from '../middleware/chatAuth.js';

const router = Router();

// Automated test runs only — never set DISABLE_RATE_LIMIT in production.
const skipInTests = () => process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV === 'test';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { ok: false, message: 'Too many sign-in attempts. Please try again in 15 minutes.' },
});

// Every admin API call (also throttles unauthenticated probing of admin URLs).
const adminApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 900,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTests,
  message: { ok: false, message: 'Too many requests. Please wait a few minutes.' },
});

// Account-changing actions and exports.
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTests,
  message: { ok: false, message: 'Too many account actions. Please wait 15 minutes.' },
});

router.post('/auth/login', loginLimiter, admin.login);
// Reset endpoints share the IP limiter (successful requests are not counted); the controller also
// caps codes per email (CHAT_CODES_PER_EMAIL per 15 minutes). Registered once — a duplicate
// registration was unreachable and has been removed.
router.post('/auth/request-reset', loginLimiter, admin.requestAdminPasswordReset);
router.post('/auth/reset-password', loginLimiter, admin.resetAdminPassword);

// Everything below requires a server-validated owner admin session (checked on every request).
router.use(adminApiLimiter);
router.use(requireAdmin);
router.post('/auth/logout', admin.logout);
router.post('/auth/logout-others', sensitiveLimiter, admin.logoutOtherSessions);
router.get('/account', admin.account);
router.get('/dashboard', admin.dashboard);
router.get('/analytics', admin.analytics);
router.get('/audit-logs', admin.listAuditLogs);
router.patch('/conversations/:id/status', admin.setConversationStatus);
router.get('/users', admin.listUsers);
router.get('/users/export', sensitiveLimiter, admin.exportUsers);
router.get('/users/:id', admin.getUser);
router.post('/users/:id/block', admin.setUserBlocked);
router.post('/users/:id/sign-out', sensitiveLimiter, admin.signOutUser);
router.post('/users/:id/require-password-reset', sensitiveLimiter, admin.requirePasswordReset);
router.get('/contact-messages', admin.listContactMessages);
router.patch('/contact-messages/:id/read', admin.setContactRead);
router.get('/email-deliveries', admin.listEmailDeliveries);
router.get('/reports', admin.listReports);

export default router;
