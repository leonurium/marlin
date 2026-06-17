import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { detachSessionHandle, getSession, type Session } from '../lib/sessions.js';
import { isServerless } from '../lib/env.js';
import { createDeposit, getOrderStatus, confirmDeposit } from '../services/deposit.js';

const router = Router();

type SessionRequest = Request & { session: Session; sessionId: string };

async function requireSession(req: Request, res: Response, next: NextFunction) {
  const sid = req.body?.session_id || req.query?.session_id;
  if (!sid) return res.status(400).json({ error: 'session_id required' });

  const sessionId = String(sid);
  const session = await getSession(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session — call POST /api/auth/connect first' });
  }

  (req as SessionRequest).session = session;
  (req as SessionRequest).sessionId = sessionId;

  if (isServerless()) {
    res.on('finish', () => {
      void detachSessionHandle(sessionId);
    });
  }

  next();
}

// POST /api/deposit
router.post('/', requireSession, async (req, res) => {
  const { amount } = req.body;

  if (!amount || typeof amount !== 'number' || amount < 50_000) {
    return res.status(400).json({ error: 'amount must be a number >= 50000' });
  }

  try {
    const session = (req as SessionRequest).session;
    const page = await session.context.newPage();
    const result = await createDeposit(page, amount);
    await page.close();
    console.log(`[deposit] created ${result.track_code} — ${amount} + ${result.unique_code}`);
    return res.json(result);
  } catch (err: any) {
    console.error('[deposit] error:', err);
    return res.status(500).json({ error: err?.message || 'Deposit failed' });
  }
});

// POST /api/deposit/confirm
router.post('/confirm', requireSession, async (req, res) => {
  const { track_code } = req.body;

  if (!track_code) {
    return res.status(400).json({ error: 'track_code required' });
  }

  try {
    const session = (req as SessionRequest).session;
    const page = await session.context.newPage();
    const result = await confirmDeposit(page, track_code);
    await page.close();
    console.log(`[deposit] confirm ${track_code} → ${result.status}`);
    return res.json(result);
  } catch (err: any) {
    console.error('[deposit/confirm] error:', err);
    return res.status(500).json({ error: err?.message || 'Confirm failed' });
  }
});

// GET /api/deposit/:trackCode?session_id=...
router.get('/:trackCode', requireSession, async (req, res) => {
  const { trackCode } = req.params;

  try {
    const session = (req as SessionRequest).session;
    const page = await session.context.newPage();
    const result = await getOrderStatus(page, String(trackCode));
    await page.close();
    return res.json(result);
  } catch (err: any) {
    console.error('[deposit/status] error:', err);
    return res.status(500).json({ error: err?.message || 'Status check failed' });
  }
});

export default router;
