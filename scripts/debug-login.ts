import 'dotenv/config';
import { chromium } from 'playwright';
import fs from 'fs';

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/root/.cloakbrowser/chromium-146.0.7680.177.3/chrome';
const USERNAME = process.env.PROJECTS_USERNAME || 'me@leonurium.com';
const PASSWORD = process.env.PROJECTS_PASSWORD;

async function main() {
  if (!PASSWORD) { console.error('Set PROJECTS_PASSWORD'); process.exit(1); }

  const browser = await chromium.launchPersistentContext('/tmp/marlin-debug', {
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox'],
  });

  const page = browser.pages()[0] ?? await browser.newPage();

  // Step 1: Navigate to login
  console.log('1. Navigating to login page...');
  await page.goto('https://projects.co.id/public/home/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.screenshot({ path: '/tmp/marlin-debug-1-login-page.png' });
  console.log('   Title:', await page.title());
  console.log('   URL:', page.url());

  // Step 2: Check if login fields exist
  const userNameExists = await page.locator('#LoginActivity__user_name').count();
  const passwordExists = await page.locator('#LoginActivity__password').count();
  console.log(`2. Fields: #LoginActivity__user_name=${userNameExists}, #LoginActivity__password=${passwordExists}`);

  // Step 3: Fill and submit
  console.log('3. Filling credentials...');
  await page.fill('#LoginActivity__user_name', USERNAME);
  await page.fill('#LoginActivity__password', PASSWORD);
  await page.screenshot({ path: '/tmp/marlin-debug-2-filled.png' });

  console.log('   Clicking login...');
  await page.locator('#LoginActivity__login, button:has-text("Login")').first().click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/marlin-debug-3-after-login.png' });
  console.log('   URL after login:', page.url());

  // Step 4: Check result
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const wafBlocked = bodyText.includes("can't let you in (WAF)") || bodyText.includes('You Shall Not Pass');
  console.log('4. WAF blocked:', wafBlocked);
  
  const loggedInText = await page.locator('a:has-text("Logged in as")').first().textContent().catch(() => null);
  console.log('   Logged in as:', loggedInText);

  const isLoginPage = page.url().includes('/login');
  console.log('   Still on login page:', isLoginPage);

  if (loggedInText) {
    console.log('5. ✅ LOGIN SUCCESS');
  } else {
    console.log('5. ❌ LOGIN FAILED');
    // Check what error/login message is shown
    const errorEl = await page.locator('.error-message, .alert, #LoginActivity__error, [class*="error"]').first().textContent().catch(() => null);
    if (errorEl) console.log('   Error:', errorEl.trim());
  }

  // Environment check
  console.log('\n--- Environment ---');
  console.log('CHROMIUM_PATH:', CHROMIUM_PATH);
  console.log('Binary exists:', fs.existsSync(CHROMIUM_PATH));

  await browser.close();
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
