process.env.MANAGER_PROXY = 'http://erid:b3nEr!d@43.134.173.90:3128';

import 'dotenv/config';

async function main() {
  const { createProfile, launchProfile, profileCdpUrl, releaseProfile } = await import('../src/lib/manager.js');
  const { chromium } = await import('playwright');

  const USERNAME = 'bornToW1n';
  const PASSWORD = 'bornToW1n';

  console.log(`1. Creating profile with proxy: ${process.env.MANAGER_PROXY}...`);
  const profileId = await createProfile(`marlin-waf-test-${Date.now()}`);
  console.log(`   Profile: ${profileId}`);

  try {
    console.log('2. Launching profile...');
    await launchProfile(profileId);
    console.log('   Connecting via CDP...');
    const browser = await chromium.connectOverCDP(profileCdpUrl(profileId));
    const ctx = browser.contexts()[0];
    const page = ctx?.pages()[0] ?? await browser.newPage();

    console.log('3. Navigating to projects.co.id login...');
    await page.goto('https://projects.co.id/public/home/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    console.log('   Title:', await page.title());
    console.log('   URL:', page.url());

    // Check WAF
    const bodyBefore = await page.locator('body').innerText().catch(() => '');
    const wafBefore = bodyBefore.includes("can't let you in (WAF)") || bodyBefore.includes('You Shall Not Pass');
    console.log('4. WAF before login:', wafBefore);

    if (!wafBefore) {
      console.log('5. Filling credentials...');
      await page.fill('#LoginActivity__user_name', USERNAME);
      await page.fill('#LoginActivity__password', PASSWORD);
      await page.locator('#LoginActivity__login, button:has-text("Login")').first().click();
      await page.waitForTimeout(8000);

      console.log('   URL after login:', page.url());
      const bodyAfter = await page.locator('body').innerText().catch(() => '');
      const wafAfter = bodyAfter.includes("can't let you in (WAF)") || bodyAfter.includes('You Shall Not Pass');
      console.log('6. WAF after login:', wafAfter);

      const loggedInText = await page.locator('a:has-text("Logged in as")').first().textContent().catch(() => null);
      console.log('   Logged in as:', loggedInText);

      if (loggedInText) {
        console.log('7. ✅ LOGIN SUCCESS via Manager + proxy');
      } else if (wafAfter) {
        console.log('7. ❌ WAF BLOCKED via Manager + proxy');
      } else {
        console.log('7. ❌ LOGIN FAILED (no WAF, no logged-in text)');
      }
    }

    await browser.close();
  } finally {
    console.log('8. Cleaning up profile...');
    await releaseProfile(profileId);
    console.log('   Done.');
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
