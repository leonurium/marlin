import { v4 as uuidv4 } from 'uuid';
import type { Browser, BrowserContext } from 'playwright';
import {
  detachManagerSession,
  disconnectManagerSession,
  getBrowser,
  getBrowserMode,
  reconnectManagerProfile,
  type BrowserMode,
} from './browser.js';
import { isServerless } from './env.js';
import { releaseProfile } from './manager.js';
import { getRedis, isRedisEnabled } from './redis.js';

const SESSION_TTL = parseInt(process.env.SESSION_TTL_MS || '1800000', 10);
const SESSION_TTL_SEC = Math.max(1, Math.ceil(SESSION_TTL / 1000));
const REDIS_KEY_PREFIX = 'marlin:session:';

export interface SessionRecord {
  id: string;
  username: string;
  lastAccess: number;
  profileId?: string;
  browserMode: BrowserMode;
  storageState?: Awaited<ReturnType<BrowserContext['storageState']>>;
}

export interface Session {
  id: string;
  context: BrowserContext;
  username: string;
  lastAccess: number;
  profileId?: string;
  browser?: Browser;
}

const sessions = new Map<string, Session>();

function redisKey(id: string): string {
  return `${REDIS_KEY_PREFIX}${id}`;
}

async function persistRecord(record: SessionRecord): Promise<void> {
  if (!isRedisEnabled()) return;
  await getRedis().set(redisKey(record.id), record, { ex: SESSION_TTL_SEC });
}

async function loadRecord(id: string): Promise<SessionRecord | null> {
  if (!isRedisEnabled()) return null;
  const record = await getRedis().get<SessionRecord>(redisKey(id));
  return record ?? null;
}

async function removeRecord(id: string): Promise<void> {
  if (!isRedisEnabled()) return;
  await getRedis().del(redisKey(id));
}

async function touchRecord(id: string, username: string, extras?: {
  profileId?: string;
  browserMode?: BrowserMode;
  storageState?: SessionRecord['storageState'];
}): Promise<void> {
  const existing = await loadRecord(id);
  const record: SessionRecord = {
    id,
    username,
    lastAccess: Date.now(),
    profileId: extras?.profileId ?? existing?.profileId,
    browserMode: extras?.browserMode ?? existing?.browserMode ?? getBrowserMode(),
    storageState: extras?.storageState ?? existing?.storageState,
  };
  await persistRecord(record);
}

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

/** Close live CDP/context but keep Redis record and Manager profile (serverless). */
export async function detachSessionHandle(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);

  if (session.profileId && session.browser) {
    await detachManagerSession({
      profileId: session.profileId,
      browser: session.browser,
      context: session.context,
    });
    return;
  }
  await session.context.close().catch(() => {});
}

async function hydrateSession(record: SessionRecord): Promise<Session | null> {
  try {
    if (record.browserMode === 'manager' && record.profileId) {
      const managerSession = await reconnectManagerProfile(record.profileId);
      const session: Session = {
        id: record.id,
        context: managerSession.context,
        username: record.username,
        lastAccess: Date.now(),
        profileId: record.profileId,
        browser: managerSession.browser,
      };
      sessions.set(record.id, session);
      await touchRecord(record.id, record.username, {
        profileId: record.profileId,
        browserMode: record.browserMode,
      });
      console.log(`[session] restored from redis: ${record.id}`);
      return session;
    }

    const browser = await getBrowser();
    const context = await browser.newContext(
      record.storageState ? { storageState: record.storageState } : undefined,
    );
    const session: Session = {
      id: record.id,
      context,
      username: record.username,
      lastAccess: Date.now(),
    };
    sessions.set(record.id, session);
    await touchRecord(record.id, record.username, {
      browserMode: record.browserMode,
      storageState: record.storageState,
    });
    console.log(`[session] restored from redis: ${record.id}`);
    return session;
  } catch (err) {
    console.error(`[session] failed to restore ${record.id}:`, err);
    await removeRecord(record.id);
    if (record.profileId) {
      await releaseProfile(record.profileId).catch(() => {});
    }
    return null;
  }
}

// Cleanup expired in-memory sessions (long-running Node only)
if (!isServerless()) {
  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastAccess > SESSION_TTL) {
        sessions.delete(id);
        void destroySession(session);
        void removeRecord(id);
        console.log(`[session] expired: ${id}`);
      }
    }
  }, 5 * 60_000);
}

export async function createSession(
  context: BrowserContext,
  username: string,
  extras?: { profileId?: string; browser?: Browser },
): Promise<string> {
  const id = uuidv4();
  const browserMode = getBrowserMode();
  const storageState = browserMode !== 'manager'
    ? await context.storageState().catch(() => undefined)
    : undefined;

  const session: Session = {
    id,
    context,
    username,
    lastAccess: Date.now(),
    profileId: extras?.profileId,
    browser: extras?.browser,
  };
  sessions.set(id, session);

  await persistRecord({
    id,
    username,
    lastAccess: session.lastAccess,
    profileId: extras?.profileId,
    browserMode,
    storageState,
  });

  if (isServerless()) {
    await detachSessionHandle(id);
  }

  return id;
}

export async function getSession(id: string): Promise<Session | null> {
  const cached = sessions.get(id);
  if (cached) {
    cached.lastAccess = Date.now();
    void touchRecord(id, cached.username, {
      profileId: cached.profileId,
      browserMode: getBrowserMode(),
    });
    return cached;
  }

  const record = await loadRecord(id);
  if (!record) return null;
  if (Date.now() - record.lastAccess > SESSION_TTL) {
    await removeRecord(id);
    return null;
  }

  return hydrateSession(record);
}

export async function deleteSession(id: string): Promise<boolean> {
  const session = sessions.get(id);
  if (session) {
    sessions.delete(id);
    await destroySession(session);
    await removeRecord(id);
    return true;
  }

  const record = await loadRecord(id);
  if (!record) return false;

  if (record.profileId) {
    await releaseProfile(record.profileId).catch(() => {});
  }
  await removeRecord(id);
  return true;
}

export async function listSessions(): Promise<Array<{ id: string; username: string; age: number }>> {
  const now = Date.now();
  const seen = new Set<string>();
  const result: Array<{ id: string; username: string; age: number }> = [];

  for (const s of sessions.values()) {
    seen.add(s.id);
    result.push({
      id: s.id,
      username: s.username,
      age: Math.round((now - s.lastAccess) / 1000),
    });
  }

  if (isRedisEnabled()) {
    const keys = await getRedis().keys(`${REDIS_KEY_PREFIX}*`);
    for (const key of keys) {
      const record = await getRedis().get<SessionRecord>(key);
      if (!record || seen.has(record.id)) continue;
      result.push({
        id: record.id,
        username: record.username,
        age: Math.round((now - record.lastAccess) / 1000),
      });
    }
  }

  return result;
}
