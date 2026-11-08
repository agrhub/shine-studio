import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { getDatabaseProvider } from '@/database/index.js';
import { emailService } from '@/services/EmailService.js';
import { requireAuth, requireAdmin } from '@/middleware/RequireAuth.js';
import { Logger } from '@/utils/logger.js';

const router = Router();

/** Inquiries are kept in one system-settings document (newest first, capped). */
const STORE_KEY = 'contact_inquiries';
const MAX_STORED = 1000;
const CATEGORIES = ['GENERAL', 'SUPPORT', 'BILLING', 'PARTNERSHIP', 'BUG', 'FEEDBACK'];
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

export interface ContactInquiry {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
  created_at: string;
  status: 'new' | 'resolved';
}

/**
 * POST /api/contact — public contact form (rate limited at mount time).
 * Validates input, stores the inquiry and emails it to ADMIN_EMAIL.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const body = req.body || {};
  // Honeypot: real users never fill this hidden field. Pretend success so bots learn nothing.
  if (typeof body.website === 'string' && body.website.trim()) {
    res.status(201).json({ message: 'Thank you! Your inquiry has been received.', ticket_id: `ticket_${nanoid(8)}` });
    return;
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  const subject = String(body.subject || '').trim() || 'Contact form inquiry';
  const category = CATEGORIES.includes(String(body.category || '').toUpperCase()) ? String(body.category).toUpperCase() : 'GENERAL';

  const errors: string[] = [];
  if (!name || name.length > 100) errors.push('Name is required (max 100 characters).');
  if (!EMAIL_RE.test(email) || email.length > 254) errors.push('A valid email address is required.');
  if (message.length < 10 || message.length > 5000) errors.push('Message must be between 10 and 5000 characters.');
  if (subject.length > 200) errors.push('Subject must be at most 200 characters.');
  if (errors.length) {
    res.status(400).json({ message: errors.join(' '), error: 'INVALID_INPUT', errors });
    return;
  }

  const inquiry: ContactInquiry = {
    id: `ticket_${nanoid(8)}`,
    name,
    email,
    subject,
    message,
    category,
    created_at: new Date().toISOString(),
    status: 'new',
  };

  try {
    const db = await getDatabaseProvider();
    const existing = (await db.getSystemSetting<ContactInquiry[]>(STORE_KEY)) || [];
    await db.saveSystemSetting(STORE_KEY, [inquiry, ...existing].slice(0, MAX_STORED));
  } catch (err: any) {
    Logger.error(`[Contact] Failed to store inquiry ${inquiry.id}: ${err?.message}`);
    res.status(500).json({ message: 'Your message could not be saved. Please try again later.', error: 'STORE_FAILED' });
    return;
  }

  // Email is best-effort: the inquiry is already stored for the admin view.
  emailService.sendContactInquiry(inquiry).catch((err) => Logger.warn(`[Contact] Notification email failed: ${err?.message}`));
  Logger.info(`[Contact] New inquiry ${inquiry.id} (${category})`);

  res.status(201).json({
    message: `Thank you, ${name}! Your inquiry has been received. We will reply to ${email}.`,
    ticket_id: inquiry.id,
  });
});

/** GET /api/contact/tickets — admin only (previously public, exposing every sender's email). */
router.get('/tickets', requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const db = await getDatabaseProvider();
  const tickets = (await db.getSystemSetting<ContactInquiry[]>(STORE_KEY)) || [];
  res.json({ count: tickets.length, tickets });
});

export default router;
