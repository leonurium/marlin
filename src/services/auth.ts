import type { Page } from 'playwright';

const BASE_URL = 'https://projects.co.id/';

export type LoginFailureReason = 'waf' | 'credentials';
export type LoginResult = { ok: true } | { ok: false; reason: LoginFailureReason };

async function isWafBlocked(page: Page): Promise<boolean> {
  const text = await page.locator('body').innerText().catch(() => '');
  return text.includes("can't let you in (WAF)") || text.includes('You Shall Not Pass');
}

export async function ensureLoggedIn(page: Page): Promise<boolean> {
  await page.goto(BASE_URL + 'user/my_orders', { timeout: 30_000 });
  await page.waitForTimeout(2_000);

  if (await isWafBlocked(page)) return false;
  const content = await page.content();
  if (content.includes('LoginActivity__user_name') || page.url().includes('/login')) {
    return false;
  }
  return true;
}

export async function doLogin(page: Page, username: string, password: string): Promise<LoginResult> {
  await page.goto(BASE_URL + 'public/home/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#LoginActivity__user_name', { timeout: 30_000 });

  await page.fill('#LoginActivity__user_name', username);
  await page.fill('#LoginActivity__password', password);
  await page.locator('#LoginActivity__login, button:has-text("Login")').first().click();
  await page.waitForTimeout(5_000);

  if (await isWafBlocked(page)) {
    return { ok: false, reason: 'waf' };
  }

  if (await getLoggedInUsername(page)) {
    return { ok: true };
  }

  if (!page.url().includes('/login')) {
    return { ok: true };
  }

  return { ok: false, reason: 'credentials' };
}

export async function getLoggedInUsername(page: Page): Promise<string | null> {
  const username = await page.locator('a:has-text("Logged in as")').first().textContent().catch(() => null);
  if (username) {
    return username.replace('Logged in as ', '').trim();
  }
  return null;
}
