/**
 * Smoke test: Manager profile create → launch → CDP → navigate.
 * Run: npx tsx scripts/test-manager.ts
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import {
  createProfile,
  launchProfile,
  profileCdpUrl,
  releaseProfile,
} from '../src/lib/manager.js';

async function main() {
  const profileId = await createProfile(`marlin-test-${Date.now()}`);
  try {
    await launchProfile(profileId);
    const browser = await chromium.connectOverCDP(profileCdpUrl(profileId));
    const page = browser.contexts()[0]?.pages()[0] ?? await browser.newPage();
    const res = await page.goto('https://projects.co.id', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    console.log('status:', res?.status(), 'title:', await page.title());
    await browser.close();
    console.log('PASS');
  } finally {
    await releaseProfile(profileId);
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
