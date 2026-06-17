const MANAGER_URL = (process.env.MANAGER_URL || '').replace(/\/$/, '');
const MANAGER_AUTH_TOKEN = process.env.MANAGER_AUTH_TOKEN;
const MANAGER_PROXY = process.env.MANAGER_PROXY;
const MANAGER_GEOIP = process.env.MANAGER_GEOIP === 'true' || Boolean(MANAGER_PROXY);
const MANAGER_HEADLESS = process.env.MANAGER_HEADLESS !== 'false';

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (MANAGER_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${MANAGER_AUTH_TOKEN}`;
  }
  return headers;
}

function ensureManagerUrl(): string {
  if (!MANAGER_URL) {
    throw new Error('MANAGER_URL is required when BROWSER_MODE=manager');
  }
  return MANAGER_URL;
}

async function managerFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = ensureManagerUrl();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...apiHeaders(), ...init?.headers },
  });
  return res;
}

export function getManagerUrl(): string {
  return MANAGER_URL;
}

export function profileCdpUrl(profileId: string): string {
  return `${ensureManagerUrl()}/api/profiles/${profileId}/cdp`;
}

export async function createProfile(name: string): Promise<string> {
  const fingerprintSeed = Math.floor(10000 + Math.random() * 90000);
  const body: Record<string, unknown> = {
    name,
    fingerprint_seed: fingerprintSeed,
    headless: MANAGER_HEADLESS,
    humanize: true,
    platform: 'windows',
    screen_width: 1920,
    screen_height: 1080,
    locale: 'id-ID',
    timezone: 'Asia/Jakarta',
    geoip: MANAGER_GEOIP,
  };
  if (MANAGER_PROXY) {
    body.proxy = MANAGER_PROXY;
  }

  const res = await managerFetch('/api/profiles', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Manager create profile failed (${res.status}): ${body}`);
  }

  const data = await res.json() as { id: string };
  return data.id;
}

export async function launchProfile(profileId: string): Promise<void> {
  const res = await managerFetch(`/api/profiles/${profileId}/launch`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Manager launch profile failed (${res.status}): ${body}`);
  }
}

export async function stopProfile(profileId: string): Promise<void> {
  const res = await managerFetch(`/api/profiles/${profileId}/stop`, { method: 'POST' });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Manager stop profile failed (${res.status}): ${body}`);
  }
}

export async function deleteProfile(profileId: string): Promise<void> {
  const res = await managerFetch(`/api/profiles/${profileId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Manager delete profile failed (${res.status}): ${body}`);
  }
}

export async function releaseProfile(profileId: string): Promise<void> {
  await stopProfile(profileId).catch((err) => {
    console.warn(`[manager] stop profile ${profileId}:`, err);
  });
  await deleteProfile(profileId).catch((err) => {
    console.warn(`[manager] delete profile ${profileId}:`, err);
  });
}
