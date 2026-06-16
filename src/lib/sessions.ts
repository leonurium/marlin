import { v4 as uuidv4 } from 'uuid';
import type { Browser, BrowserContext } from 'playwright';
import { disconnectManagerSession } from './browser.js';

const SESSION_TTL = parseInt(process.env.SESSION_TTL_MS || '1800000');

interface Session {
  id: string;
  context: BrowserContext;
  username: string;
  lastAccess: number;
  profileId?: string;
  browser?: Browser;
}

const sessions = new Map<string, Session>();

async function destroySession(session: Session): Promise<void> {
  if (session.profileId && session.browser) {
    await disconnectManagerSession({
      profileId: session.profileId,
      browser: session.browser,
      context: session.context,
    });
    return;
  }
  await session.context.close().catch(() => {});
}

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastAccess > SESSION_TTL) {
      sessions.delete(id);
      void destroySession(session);
      console.log(`[session] expired: ${id}`);
    }
  }
}, 5 * 60_000);

export function createSession(
  context: BrowserContext,
  username: string,
  extras?: { profileId?: string; browser?: Browser },
): string {
  const id = uuidv4();
  sessions.set(id, {
    id,
    context,
    username,
    lastAccess: Date.now(),
    profileId: extras?.profileId,
    browser: extras?.browser,
  });
  return id;
}

export function getSession(id: string): Session | null {
  const session = sessions.get(id);
  if (!session) return null;
  session.lastAccess = Date.now();
  return session;
}

export function deleteSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  sessions.delete(id);
  void destroySession(session);
  return true;
}

export function listSessions(): Array<{ id: string; username: string; age: number }> {
  const now = Date.now();
  return [...sessions.values()].map(s => ({
    id: s.id,
    username: s.username,
    age: Math.round((now - s.lastAccess) / 1000),
  }));
}
