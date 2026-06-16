import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth.js';
import depositRouter from './routes/deposit.js';
import { getBrowserConfig } from './lib/browser.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3100');

app.use(cors());
app.use(express.json());

// Rate limiting
app.use('/api/', rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/deposit', depositRouter);

// Health
app.get('/api/health', (_req, res) => {
  const browser = getBrowserConfig();
  res.json({
    status: 'ok',
    version: '1.0.0',
    browser: { mode: browser.mode, endpoint: browser.endpoint },
  });
});

app.listen(PORT, () => {
  const browser = getBrowserConfig();
  console.log(`[marlin] 🐟 listening on http://localhost:${PORT}`);
  console.log(`[marlin] browser mode: ${browser.mode}`);
});
