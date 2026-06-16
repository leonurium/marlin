/**
 * Full auth integration test via Marlin API.
 * Run:
 *   PROJECTS_USERNAME=you PROJECTS_PASSWORD=secret npm run test:auth
 */
import 'dotenv/config';

const BASE = `http://localhost:${process.env.PORT || 3100}`;
const username = process.env.PROJECTS_USERNAME;
const password = process.env.PROJECTS_PASSWORD;

async function main() {
  if (!username || !password) {
    console.error('Set PROJECTS_USERNAME and PROJECTS_PASSWORD env vars.');
    process.exit(1);
  }

  console.log('[test] Health...');
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log(health);

  console.log('[test] POST /api/auth/connect (may take ~15s)...');
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/auth/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  console.log(`[test] ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(body);

  if (!res.ok) {
    process.exit(1);
  }

  console.log('[test] PASS — logged in, session_id:', body.session_id);
}

main().catch((err) => {
  console.error('[test] FAIL:', err);
  process.exit(1);
});
