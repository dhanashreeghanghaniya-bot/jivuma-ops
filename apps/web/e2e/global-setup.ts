import { execSync } from 'node:child_process';
import path from 'node:path';

/** Creates or reactivates the test salesman and clears his work (apps/api/prisma/e2e-reset.ts). */
export default function globalSetup() {
  execSync('pnpm exec tsx prisma/e2e-reset.ts up', {
    cwd: path.resolve(__dirname, '../../api'),
    stdio: 'inherit',
  });
}
