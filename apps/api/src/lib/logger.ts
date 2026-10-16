import { isTest } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

/** Keys whose values must never reach the logs. */
const REDACTED = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
  'authorization',
  'cookie',
  'phone',
  'altphone',
  'email',
]);

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED.has(k.toLowerCase()) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
}

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (isTest) return;
  const line = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? { context: scrub(context) } : {}),
  };
  const serialised = JSON.stringify(line);
  if (level === 'error') console.error(serialised);
  else if (level === 'warn') console.warn(serialised);
  else console.log(serialised);
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => write('debug', m, c),
  info: (m: string, c?: Record<string, unknown>) => write('info', m, c),
  warn: (m: string, c?: Record<string, unknown>) => write('warn', m, c),
  error: (m: string, c?: Record<string, unknown>) => write('error', m, c),
};
