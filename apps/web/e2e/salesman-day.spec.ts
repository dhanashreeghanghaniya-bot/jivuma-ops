import { devices, expect, test } from '@playwright/test';
import { E2E_SALESMAN_MOBILE, signIn } from './helpers';

// Standing at Shree Kirana Store, Rajkot (seeded), so the check-in is not flagged.
const SHOP = { name: 'Shree Kirana Store', latitude: 22.29713, longitude: 70.802779 };

test.use({
  ...devices['Pixel 7'],
  // Chrome, not the device's default engine, so the run needs no extra browser.
  defaultBrowserType: 'chromium',
  geolocation: { latitude: SHOP.latitude, longitude: SHOP.longitude, accuracy: 12 },
  permissions: ['geolocation'],
});

/** SPEC 5.1: start the day, visit a shop, end the day, submit it. */
test('salesman runs a whole day', async ({ page }) => {
  await signIn(page, E2E_SALESMAN_MOBILE);
  await expect(page).toHaveURL(/\/app$/);

  // 1. Start day (global setup cleared any earlier day).
  await expect(page.getByText('Start your day')).toBeVisible();
  await page.getByRole('button', { name: 'Start Day' }).click();
  await expect(page.getByRole('link', { name: 'New Visit' })).toBeVisible();

  // 2. Visit: auto check-in, pick the shop, no order with a reason.
  await page.getByRole('link', { name: 'New Visit' }).click();
  await expect(page.getByText(/Checked in ±\d+ m/)).toBeVisible();
  await page.getByPlaceholder('Search shop, owner or phone').fill('Shree Kirana');
  await page.getByRole('button', { name: new RegExp(SHOP.name) }).click();
  await expect(page.getByText(/from this shop's saved location/)).toBeVisible();
  await page.getByRole('button', { name: 'No order', exact: true }).click();
  await page.getByRole('button', { name: 'Enough stock' }).click();
  await page.getByRole('button', { name: 'Save visit' }).click();
  await expect(page).toHaveURL(/\/app$/);

  // The outbox syncs it; Today counts it once the server has it.
  await expect(page.getByText('Visits', { exact: true }).first().locator('..')).toContainText('1');

  // 3. End day.
  await page.getByRole('link', { name: 'End Day' }).click();
  await expect(page.getByRole('heading', { name: 'End day' })).toBeVisible();
  await expect(page.getByText(/Not synced yet/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Bike' }).click();
  await page.getByRole('button', { name: 'End Day' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(/Day ended at/)).toBeVisible();

  // 4. Submit: the drafted DA arrives with the summary.
  const submit = page.getByRole('button', { name: 'Submit day with expenses' });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText(/Submitted and locked/)).toBeVisible();
});
