import { Router } from 'express';
import {
  connectManagerSession,
  disconnectManagerSession,
  getBrowser,
  getBrowserMode,
} from '../lib/browser.js';
import { createSession, deleteSession, listSessions } from '../lib/sessions.js';
import { doLogin, getLoggedInUsername } from '../services/auth.js';

const router = Router();

interface ConnectBody {
  username: string;
  password: string;
}

const CONTEXT_OPTIONS = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  viewport: { width: 1920, height: 1080 } as const,
  locale: 'en-US',
};

// POST /api/auth/connect
router.post('/connect', async (req, res) => {
  const { username, password } = req.body as ConnectBody;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  let managerSession: Awaited<ReturnType<typeof connectManagerSession>> | null = null;

  try {
    let context;
    let profileId: string | undefined;
    let browser;

    if (getBrowserMode() === 'manager') {
      managerSession = await connectManagerSession(`marlin-${username}-${Date.now()}`);
      context = managerSession.context;
      profileId = managerSession.profileId;
      browser = managerSession.browser;
    } else {
      const shared = await getBrowser();
      context = await shared.newContext(CONTEXT_OPTIONS);
    }

    const page = await context.newPage();

    const loginResult = await doLogin(page, username, password);
    if (!loginResult.ok) {
      if (managerSession) {
        await disconnectManagerSession(managerSession);
      } else {
        await context.close();
      }
      if (loginResult.reason === 'waf') {
        return res.status(403).json({
          error: 'Blocked by Projects.co.id WAF — the site rejected the automated login. Try again later or use local browser mode.',
        });
      }
      return res.status(401).json({ error: 'Login failed — check credentials' });
    }

    const loggedInAs = await getLoggedInUsername(page);
    const sessionId = await createSession(context, loggedInAs || username, { profileId, browser });
    await page.close();

    console.log(`[auth] ${loggedInAs} connected — session ${sessionId}`);
    return res.json({ session_id: sessionId, message: `Logged in as ${loggedInAs || username}` });
  } catch (err) {
    if (managerSession) {
      await disconnectManagerSession(managerSession).catch(() => {});
    }
    console.error('[auth] connect error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/auth/disconnect
router.delete('/disconnect', async (req, res) => {
  const sessionId = req.headers['x-session-id'] as string;
  if (!sessionId) {
    return res.status(400).json({ error: 'x-session-id header required' });
  }
  const deleted = await deleteSession(sessionId);
  if (!deleted) {
    return res.status(404).json({ error: 'Session not found' });
  }
  console.log(`[auth] session ${sessionId} disconnected`);
  return res.json({ message: 'Session closed' });
});

// GET /api/auth/sessions
router.get('/sessions', async (_req, res) => {
  res.json({ sessions: await listSessions() });
});

export default router;
