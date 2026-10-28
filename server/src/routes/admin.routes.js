import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as admin from '../controllers/admin.controller.js';
import { requireAdmin } from '../middleware/chatAuth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { ok: false, message: 'Too many sign-in attempts. Please try again in 15 minutes.' },
});

router.post('/auth/login', loginLimiter, admin.login);

// Everything below requires a server-validated admin session.
router.use(requireAdmin);
router.post('/auth/logout', admin.logout);
router.patch('/conversations/:id/status', admin.setConversationStatus);
router.post('/users/:id/block', admin.setUserBlocked);
router.get('/users', admin.listUsers);
router.get('/contact-messages', admin.listContactMessages);
router.patch('/contact-messages/:id/read', admin.setContactRead);
router.get('/email-deliveries', admin.listEmailDeliveries);
router.get('/reports', admin.listReports);

export default router;
