import { chromium, type Browser, type BrowserContext } from 'playwright';
import {
  createProfile,
  getManagerUrl,
  launchProfile,
  profileCdpUrl,
  releaseProfile,
} from './manager.js';

export type BrowserMode = 'local' | 'cdp' | 'manager';

const DEFAULT_CHROMIUM_PATH = '/root/.cloakbrowser/chromium-146.0.7680.177.3/chrome';

function resolveBrowserMode(): BrowserMode {
  const mode = process.env.BROWSER_MODE?.toLowerCase();
  if (mode === 'manager') return 'manager';
  if (mode === 'cdp' || mode === 'remote') return 'cdp';
  if (mode === 'local' || mode === 'executable') return 'local';
  if (process.env.MANAGER_URL) return 'manager';
  if (process.env.CDP_URL) return 'cdp';
  return 'local';
}

const browserMode = resolveBrowserMode();
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || DEFAULT_CHROMIUM_PATH;

function normalizeCdpUrl(url: string): string {
  return url.trim().replace(/\/json\/version\/?$/i, '').replace(/\/$/, '');
}

const CDP_URL = process.env.CDP_URL ? normalizeCdpUrl(process.env.CDP_URL) : undefined;

let sharedBrowser: Browser | null = null;

export function getBrowserMode(): BrowserMode {
  return browserMode;
}

export function getBrowserConfig(): { mode: BrowserMode; endpoint: string } {
  if (browserMode === 'manager') return { mode: 'manager', endpoint: getManagerUrl() };
  if (browserMode === 'cdp') return { mode: 'cdp', endpoint: CDP_URL || '' };
  return { mode: 'local', endpoint: CHROMIUM_PATH };
}

async function launchLocalBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
}

async function connectCdpBrowser(): Promise<Browser> {
  if (!CDP_URL) {
    throw new Error('CDP_URL is required when BROWSER_MODE=cdp');
  }
  return chromium.connectOverCDP(CDP_URL);
}

/** Shared browser for local and cdp modes (singleton). */
export async function getBrowser(): Promise<Browser> {
  if (browserMode === 'manager') {
    throw new Error('getBrowser() is not used in manager mode — use connectManagerSession()');
  }
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = browserMode === 'cdp'
      ? await connectCdpBrowser()
      : await launchLocalBrowser();
    console.log(`[browser] connected (${browserMode})`);
  }
  return sharedBrowser;
}

export interface ManagerSession {
  profileId: string;
  browser: Browser;
  context: BrowserContext;
}

/** Create, launch, and connect to a dedicated Manager profile per Marlin session. */
export async function connectManagerSession(sessionLabel: string): Promise<ManagerSession> {
  const profileId = await createProfile(sessionLabel);
  await launchProfile(profileId);

  const browser = await chromium.connectOverCDP(profileCdpUrl(profileId));
  const context = browser.contexts()[0] ?? await browser.newContext();

  console.log(`[manager] connected profile ${profileId}`);
  return { profileId, browser, context };
}

export async function disconnectManagerSession(session: ManagerSession): Promise<void> {
  const { profileId, browser, context } = session;
  await context.close().catch(() => {});
  if (browser.isConnected()) {
    await browser.close().catch(() => {});
  }
  await releaseProfile(profileId);
  console.log(`[manager] released profile ${profileId}`);
}

export async function closeBrowser() {
  if (sharedBrowser?.isConnected()) {
    await sharedBrowser.close();
  }
  sharedBrowser = null;
}
