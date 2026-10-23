/**
 * Prepares or clears the Playwright test salesman. Run by the e2e global
 * setup (`up`) and teardown (`down`) in apps/web/e2e.
 *
 *   up:   create or reactivate the salesman, give him Rajkot, wipe his work
 *   down: wipe his work again and deactivate him, so he never appears in
 *         payroll, the sales-team view or the user list as active
 *
 * Never point this at the production database: it deletes the test
 * salesman's work days, visits, orders, leads and expenses outright.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

export const E2E_SALESMAN_ID = 'seed_user_e2e';
export const E2E_SALESMAN_PHONE = '+919812300009';
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Juma@12345';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

async function wipeWork(salesmanId: string) {
  const visits = await prisma.visit.findMany({ where: { salesmanId }, select: { id: true } });
  const visitIds = visits.map((v) => v.id);
  await prisma.$transaction([
    prisma.order.deleteMany({
      where: { OR: [{ takenBySalesmanId: salesmanId }, { visitId: { in: visitIds } }] },
    }),
    prisma.retailer.updateMany({
      where: { addedBySalesmanId: salesmanId },
      data: { addedBySalesmanId: null },
    }),
    prisma.visit.deleteMany({ where: { salesmanId } }),
    prisma.locationPing.deleteMany({ where: { salesmanId } }),
    prisma.expenseClaim.deleteMany({ where: { salesmanId } }),
    prisma.lead.deleteMany({ where: { assignedToId: salesmanId } }),
    prisma.workDay.deleteMany({ where: { salesmanId } }),
    prisma.notification.deleteMany({ where: { userId: salesmanId } }),
    prisma.monthlyCostReport.deleteMany({ where: { salesmanId } }),
  ]);
}

async function up() {
  const salesman1 = await prisma.user.findUniqueOrThrow({
    where: { id: 'seed_user_salesman1' },
    select: { hqTownId: true },
  });
  const rajkot = await prisma.district.findFirstOrThrow({ where: { code: 'RJT' } });
  await prisma.user.upsert({
    where: { id: E2E_SALESMAN_ID },
    create: {
      id: E2E_SALESMAN_ID,
      name: 'E2E Salesman',
      phone: E2E_SALESMAN_PHONE,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      role: Role.SALESMAN,
      joiningDate: new Date('2024-01-01T00:00:00.000Z'),
      hqTownId: salesman1.hqTownId,
    },
    update: { isActive: true, deletedAt: null },
  });
  await prisma.salesmanTerritory.upsert({
    where: { salesmanId_districtId: { salesmanId: E2E_SALESMAN_ID, districtId: rajkot.id } },
    create: { salesmanId: E2E_SALESMAN_ID, districtId: rajkot.id },
    update: {},
  });
  await wipeWork(E2E_SALESMAN_ID);
}

async function down() {
  await wipeWork(E2E_SALESMAN_ID);
  await prisma.user.updateMany({ where: { id: E2E_SALESMAN_ID }, data: { isActive: false } });
  await prisma.refreshToken.deleteMany({ where: { userId: E2E_SALESMAN_ID } });
}

const mode = process.argv[2];
if (mode !== 'up' && mode !== 'down') {
  console.error('Usage: tsx prisma/e2e-reset.ts up|down');
  process.exit(1);
}
(mode === 'up' ? up() : down())
  .then(() => console.log(`e2e ${mode}: done`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
