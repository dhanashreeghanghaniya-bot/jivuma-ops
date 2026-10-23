import { execSync } from 'node:child_process';
import path from 'node:path';

/** Clears the test salesman's work and deactivates him again. */
export default function globalTeardown() {
  execSync('pnpm exec tsx prisma/e2e-reset.ts down', {
    cwd: path.resolve(__dirname, '../../api'),
    stdio: 'inherit',
  });
}
