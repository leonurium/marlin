import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth.js';
import depositRouter from './routes/deposit.js';
import { getBrowserConfig } from './lib/browser.js';
import { isServerless, validateDeploymentConfig } from './lib/env.js';

validateDeploymentConfig();

const app = express();

// Vercel sets X-Forwarded-For; express-rate-limit requires trust proxy
if (isServerless()) {
  app.set('trust proxy', 1);
}

app.use(cors());
app.use(express.json());

app.use('/api/', rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use('/api/auth', authRouter);
app.use('/api/deposit', depositRouter);

app.get('/api/health', (_req, res) => {
  const browser = getBrowserConfig();
  res.json({
    status: 'ok',
    version: '1.0.0',
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    browser: { mode: browser.mode, endpoint: browser.endpoint },
  });
});

export default app;
