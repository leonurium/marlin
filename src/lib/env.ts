import { getBrowserMode } from './browser.js';
import { isRedisEnabled } from './redis.js';

/** True when running on Vercel (serverless). */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

export function validateDeploymentConfig(): void {
  if (!isServerless()) return;

  const errors: string[] = [];
  if (getBrowserMode() !== 'manager') {
    errors.push('BROWSER_MODE must be "manager" on Vercel');
  }
  if (!process.env.MANAGER_URL) {
    errors.push('MANAGER_URL is required on Vercel');
  }
  if (!isRedisEnabled()) {
    errors.push('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required on Vercel');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid Vercel configuration:\n- ${errors.join('\n- ')}`);
  }
}
