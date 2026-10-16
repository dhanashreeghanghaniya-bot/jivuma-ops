import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Keeps config/env.ts happy without requiring a real .env during tests.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://juma:juma@localhost:5432/juma_test?schema=public',
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-000000',
      JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-00000',
      CORS_ORIGINS: 'http://localhost:3000',
    },
  },
});
