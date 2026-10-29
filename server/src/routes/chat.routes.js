import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import * as auth from '../controllers/chatAuth.controller.js';
import * as chat from '../controllers/chat.controller.js';
import { attachmentTooLarge } from '../middleware/errorHandler.js';
import { requireChatAuth } from '../middleware/chatAuth.js';

const router = Router();

// 10 MB or smaller: a file of exactly config.attachments.maxBytes is accepted.
function rejectOversizedAttachment(req, res, next) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > config.attachments.maxBytes) {
    // Do not keep reading a body we will never accept.
    res.set('Connection', 'close');
    return attachmentTooLarge(res);
  }
  return next();
}

const limiter = (limit, windowMin, message) =>
  rateLimit({
    windowMs: windowMin * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { ok: false, message },
    // Automated test runs only — never set this in production.
    skip: () => process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV === 'test',
  });

const codeRequestLimiter = limiter(5, 15, 'Too many verification requests. Please try again in 15 minutes.');
const verifyLimiter = limiter(15, 15, 'Too many verification attempts. Please try again later.');
const messageLimiter = limiter(40, 1, 'You are sending messages too quickly. Please slow down.');
const writeLimiter = limiter(60, 15, 'Too many requests. Please try again later.');

// Public
router.get('/status', auth.chatStatus);
router.post('/auth/request-verification', codeRequestLimiter, auth.requestVerification);
router.post('/auth/verify', verifyLimiter, auth.verifyCode);
router.post('/auth/login', verifyLimiter, auth.loginVisitor);
router.post('/auth/set-password', verifyLimiter, auth.setVisitorPassword);
router.post('/auth/request-reset', codeRequestLimiter, auth.requestPasswordReset);
router.post('/auth/reset-password', verifyLimiter, auth.resetVisitorPassword);

// Authenticated (visitor or admin session)
router.use(requireChatAuth);
router.get('/me', auth.me);
router.post('/auth/logout', auth.logout);

router.get('/conversations', chat.getConversations);
router.post('/conversations/direct', writeLimiter, chat.startDirect);
router.post('/conversations/group', writeLimiter, chat.postGroup);
router.get('/conversations/:id', chat.getConversation);
router.patch('/conversations/:id', writeLimiter, chat.patchGroup);
router.get('/conversations/:id/messages', chat.getMessages);
router.post('/conversations/:id/messages', messageLimiter, chat.postMessage);
router.post(
  '/conversations/:id/attachments',
  writeLimiter,
  rejectOversizedAttachment, // refuse before reading the body when the declared size is too large
  express.raw({ type: 'application/octet-stream', limit: config.attachments.maxBytes }), // streamed bodies are capped too
  chat.postAttachment, // and the controller re-checks the received byte count
);
router.get('/attachments/:attachmentId/download', chat.downloadAttachment);
router.patch('/conversations/:id/read', chat.patchRead);
router.patch('/conversations/:id/unread', chat.patchUnread);
router.patch('/conversations/:id/mute', writeLimiter, chat.patchMute);
router.patch('/conversations/:id/members', writeLimiter, chat.patchMembers);
router.delete('/conversations/:id/members/:userId', writeLimiter, chat.deleteMember);
router.post('/conversations/:id/report', writeLimiter, chat.postReport);

export default router;
