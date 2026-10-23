import { expect, type Page } from '@playwright/test';

/** Seeded logins (apps/api/prisma/seed.ts) and the e2e salesman (prisma/e2e-reset.ts). */
export const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Juma@12345';
export const ADMIN_MOBILE = '9812300001';
export const E2E_SALESMAN_MOBILE = '9812300009';

export async function signIn(page: Page, mobile: string) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(mobile);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
