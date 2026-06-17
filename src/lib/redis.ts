import { Redis } from '@upstash/redis';

let client: Redis | null = null;

export function isRedisEnabled(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function getRedis(): Redis {
  if (!isRedisEnabled()) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required');
  }
  if (!client) {
    client = Redis.fromEnv();
  }
  return client;
}
