import 'dotenv/config';
import app from './app.js';
import { getBrowserConfig } from './lib/browser.js';

const PORT = parseInt(process.env.PORT || '3100', 10);

app.listen(PORT, () => {
  const browser = getBrowserConfig();
  console.log(`[marlin] 🐟 listening on http://localhost:${PORT}`);
  console.log(`[marlin] browser mode: ${browser.mode}`);
});
