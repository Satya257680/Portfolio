import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { contactStatus, createContact } from '../controllers/contact.controller.js';

const router = Router();

const contactLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, message: 'Too many messages from this connection. Please try again later or email me.' },
});

router.get('/status', contactStatus);
router.post('/', contactLimiter, createContact);

export default router;
