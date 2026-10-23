import {
  DayType,
  ExpenseCategory,
  ExpenseStatus,
  LeadActivityType,
  LeadSource,
  LeadStage,
  LeadType,
  OrderLevel,
  OrderStatus,
  PartyType,
  PingSource,
  PrismaClient,
  Role,
  TravelMode,
  VisitOutcome,
  VisitPhotoType,
  WorkDayStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { GUJARAT_DISTRICTS, ORDER_STATUS_FLOW } from '@juma/shared';
import { recomputeAllCoverage } from '../src/modules/geo/coverage.service';
import { DISTRIBUTORS, PRODUCTS, RETAILERS, SUPER_STOCKISTS, TOWNS } from './seed/data';
import {
  addDays,
  atIst,
  dateOnly,
  haversineMeters,
  jitter,
  makeRandom,
  orderNumber,
  pick,
  randomInt,
  round2,
  sid,
} from './seed/helpers';

// The seed is a long script of many small writes: run it on the session pooler
// (DIRECT_URL) as the README says, not the transaction pooler the API uses.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});
const rand = makeRandom(20261016);

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Juma@12345';
/** How many days of field history to generate. */
const HISTORY_DAYS = 14;

const townId = (key: string) => sid('town', key);
const districtId = (code: string) => sid('district', code);

async function seedDistricts() {
  for (const d of GUJARAT_DISTRICTS) {
    await prisma.district.upsert({
      where: { id: districtId(d.code) },
      create: {
        id: districtId(d.code),
        code: d.code,
        name: d.name,
        nameGu: d.nameGu,
        zone: d.zone,
        lat: d.lat,
        lng: d.lng,
      },
      update: {
        code: d.code,
        name: d.name,
        nameGu: d.nameGu,
        zone: d.zone,
        lat: d.lat,
        lng: d.lng,
      },
    });
  }
  console.log(`  districts: ${GUJARAT_DISTRICTS.length}`);
}

async function seedTowns() {
  for (const t of TOWNS) {
    await prisma.town.upsert({
      where: { id: townId(t.key) },
      create: {
        id: townId(t.key),
        name: t.name,
        districtId: districtId(t.districtCode),
        lat: t.lat,
        lng: t.lng,
        type: t.type,
        population: t.population ?? null,
      },
      update: {
        name: t.name,
        lat: t.lat,
        lng: t.lng,
        type: t.type,
        population: t.population ?? null,
      },
    });
  }
  console.log(`  towns: ${TOWNS.length}`);
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { id: sid('user', 'admin') },
    create: {
      id: sid('user', 'admin'),
      name: 'Jumabhai Patel',
      phone: '+919812300001',
      passwordHash,
      role: Role.ADMIN,
      joiningDate: new Date('2019-04-01T00:00:00.000Z'),
      hqTownId: townId('AHD_AHMEDABAD'),
    },
    update: { name: 'Jumabhai Patel', role: Role.ADMIN, isActive: true, passwordHash },
  });

  const salesmen = await Promise.all(
    [
      {
        key: 'salesman1',
        name: 'Ramesh Chauhan',
        phone: '+919812300002',
        hqTownKey: 'RJT_RAJKOT',
        joiningDate: '2023-06-12',
      },
      {
        key: 'salesman2',
        name: 'Suresh Makwana',
        phone: '+919812300003',
        hqTownKey: 'JMN_JAMNAGAR',
        joiningDate: '2024-01-08',
      },
    ].map((s) =>
      prisma.user.upsert({
        where: { id: sid('user', s.key) },
        create: {
          id: sid('user', s.key),
          name: s.name,
          phone: s.phone,
          passwordHash,
          role: Role.SALESMAN,
          joiningDate: new Date(`${s.joiningDate}T00:00:00.000Z`),
          hqTownId: townId(s.hqTownKey),
          reportingToId: admin.id,
        },
        update: {
          name: s.name,
          role: Role.SALESMAN,
          isActive: true,
          passwordHash,
          hqTownId: townId(s.hqTownKey),
          reportingToId: admin.id,
        },
      }),
    ),
  );

  console.log(`  users: 1 admin + ${salesmen.length} salesmen (password: ${DEFAULT_PASSWORD})`);
  return { admin, salesmen: salesmen as [(typeof salesmen)[0], (typeof salesmen)[0]] };
}

async function seedProducts() {
  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: sid('product', p.key) },
      create: {
        id: sid('product', p.key),
        name: p.name,
        sku: p.sku,
        category: p.category,
        packSize: p.packSize,
        unitsPerCase: p.unitsPerCase,
        mrp: p.mrp,
        ssPrice: p.ssPrice,
        distributorPrice: p.distributorPrice,
        retailerPrice: p.retailerPrice,
      },
      update: {
        name: p.name,
        category: p.category,
        packSize: p.packSize,
        unitsPerCase: p.unitsPerCase,
        mrp: p.mrp,
        ssPrice: p.ssPrice,
        distributorPrice: p.distributorPrice,
        retailerPrice: p.retailerPrice,
        isActive: true,
      },
    });
  }
  console.log(`  products: ${PRODUCTS.length}`);
}

async function seedAllowancePolicy() {
  const data = {
    name: 'Standard field policy 2026',
    effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
    daHq: 200,
    daExHq: 300,
    daOutstation: 500,
    taPerKmBike: 4,
    taPerKmCar: 10,
    taPerKmAuto: 6,
    maxLodgingPerNight: 900,
    monthlyPhoneAllowance: 300,
    publicTransportNeedsBill: true,
    daRequiresVisit: true,
  };

  await prisma.allowancePolicy.upsert({
    where: { id: sid('policy', 'standard') },
    create: { id: sid('policy', 'standard'), ...data },
    update: data,
  });
  console.log('  allowance policy: 1');
  return data;
}

async function seedPartners() {
  for (const ss of SUPER_STOCKISTS) {
    const town = TOWNS.find((t) => t.key === ss.townKey)!;
    const districts = ss.districtCodes.map((code) => ({ id: districtId(code) }));
    const base = {
      firmName: ss.firmName,
      ownerName: ss.ownerName,
      phone: ss.phone,
      altPhone: ss.altPhone,
      email: ss.email,
      gstin: ss.gstin,
      address: ss.address,
      townId: townId(ss.townKey),
      lat: town.lat,
      lng: town.lng,
      notes: 'Seeded demo super stockist.',
    };

    await prisma.superStockist.upsert({
      where: { id: sid('ss', ss.key) },
      create: {
        id: sid('ss', ss.key),
        ...base,
        onboardedAt: new Date('2024-05-01T00:00:00.000Z'),
        coveredDistricts: { connect: districts },
      },
      update: { ...base, coveredDistricts: { set: districts } },
    });
  }

  for (const d of DISTRIBUTORS) {
    const town = TOWNS.find((t) => t.key === d.townKey)!;
    const towns = d.coveredTownKeys.map((key) => ({ id: townId(key) }));
    const base = {
      firmName: d.firmName,
      ownerName: d.ownerName,
      phone: d.phone,
      altPhone: d.altPhone,
      gstin: d.gstin,
      address: d.address,
      townId: townId(d.townKey),
      lat: town.lat,
      lng: town.lng,
      superStockistId: sid('ss', d.superStockistKey),
      creditLimit: d.creditLimit,
      creditDays: d.creditDays,
      notes: 'Seeded demo distributor.',
    };

    await prisma.distributor.upsert({
      where: { id: sid('distributor', d.key) },
      create: {
        id: sid('distributor', d.key),
        ...base,
        onboardedAt: new Date('2024-07-15T00:00:00.000Z'),
        coveredTowns: { connect: towns },
      },
      update: { ...base, coveredTowns: { set: towns } },
    });
  }

  for (const r of RETAILERS) {
    const town = TOWNS.find((t) => t.key === r.townKey)!;
    const base = {
      shopName: r.shopName,
      ownerName: r.ownerName,
      phone: r.phone,
      address: r.address,
      townId: townId(r.townKey),
      lat: jitter(rand, town.lat, 1200),
      lng: jitter(rand, town.lng, 1200),
      distributorId: sid('distributor', r.distributorKey),
      category: r.category,
      isVerified: r.isVerified,
      addedBySalesmanId: r.addedBySalesmanKey ? sid('user', r.addedBySalesmanKey) : null,
    };

    await prisma.retailer.upsert({
      where: { id: sid('retailer', r.key) },
      create: { id: sid('retailer', r.key), ...base },
      // Coordinates are left alone on re-seed so a pin dragged in the UI survives.
      update: {
        shopName: base.shopName,
        ownerName: base.ownerName,
        phone: base.phone,
        address: base.address,
        category: base.category,
        isVerified: base.isVerified,
        addedBySalesmanId: base.addedBySalesmanId,
      },
    });
  }

  console.log(
    `  partners: ${SUPER_STOCKISTS.length} super stockists, ${DISTRIBUTORS.length} distributors, ${RETAILERS.length} retailers`,
  );
}

interface LeadSeed {
  key: string;
  type: LeadType;
  name: string;
  firmName?: string;
  phone: string;
  townKey: string;
  districtCode: string;
  source: LeadSource;
  stage: LeadStage;
  assignedToKey?: 'salesman1' | 'salesman2';
  expectedInvestment?: number;
  followUpInDays?: number;
  notes: string;
  lostReason?: string;
}

async function seedLeads(adminId: string) {
  const leads: LeadSeed[] = [
    {
      key: 'L_PRB_1',
      type: LeadType.DISTRIBUTOR,
      name: 'Mukesh Odedra',
      firmName: 'Sagar Agency',
      phone: '+919833000101',
      townKey: 'PRB_PORBANDAR',
      districtCode: 'PRB',
      source: LeadSource.FIELD,
      stage: LeadStage.CONTACTED,
      assignedToKey: 'salesman2',
      expectedInvestment: 300000,
      followUpInDays: 3,
      notes: 'Has a godown near the fishing harbour. Wants exclusivity for Porbandar city.',
    },
    {
      key: 'L_PRB_2',
      type: LeadType.RETAILER,
      name: 'Vipul Makwana',
      firmName: 'Ranavav Kirana',
      phone: '+919833000102',
      townKey: 'PRB_RANAVAV',
      districtCode: 'PRB',
      source: LeadSource.REFERRAL,
      stage: LeadStage.NEW,
      assignedToKey: 'salesman2',
      followUpInDays: 7,
      notes: 'Referred by Halar Sales Corporation.',
    },
    {
      key: 'L_AMR_1',
      type: LeadType.DISTRIBUTOR,
      name: 'Nilesh Kanabar',
      firmName: 'Kanabar Trading',
      phone: '+919833000201',
      townKey: 'AMR_AMRELI',
      districtCode: 'AMR',
      source: LeadSource.EXPO,
      stage: LeadStage.MEETING_DONE,
      assignedToKey: 'salesman2',
      expectedInvestment: 450000,
      followUpInDays: -2,
      notes: 'Met at the Rajkot food expo. Asking for 30 days credit.',
    },
    {
      key: 'L_AMR_2',
      type: LeadType.SS,
      name: 'Kishor Bhanderi',
      firmName: 'Bhanderi Distributors',
      phone: '+919833000202',
      townKey: 'AMR_SAVARKUNDLA',
      districtCode: 'AMR',
      source: LeadSource.INBOUND_CALL,
      stage: LeadStage.NEW,
      followUpInDays: 10,
      notes: 'Called the office asking about super stockist terms.',
    },
    {
      key: 'L_MRB_1',
      type: LeadType.DISTRIBUTOR,
      name: 'Ashish Patel',
      firmName: 'Morbi Sales Co',
      phone: '+919833000301',
      townKey: 'MRB_MORBI',
      districtCode: 'MRB',
      source: LeadSource.FIELD,
      stage: LeadStage.NEGOTIATION,
      assignedToKey: 'salesman1',
      expectedInvestment: 600000,
      followUpInDays: 1,
      notes: 'Negotiating margin. Already distributes two other snack brands.',
    },
    {
      key: 'L_MRB_2',
      type: LeadType.RETAILER,
      name: 'Dharmesh Sutariya',
      firmName: 'Wankaner Provision',
      phone: '+919833000302',
      townKey: 'MRB_WANKANER',
      districtCode: 'MRB',
      source: LeadSource.FIELD,
      stage: LeadStage.CONTACTED,
      assignedToKey: 'salesman1',
      followUpInDays: 5,
      notes: 'Wants a trial order of namkeen.',
    },
    {
      key: 'L_RJT_1',
      type: LeadType.RETAILER,
      name: 'Hiren Joshi',
      firmName: 'Joshi Super Store',
      phone: '+919833000401',
      townKey: 'RJT_GONDAL',
      districtCode: 'RJT',
      source: LeadSource.FIELD,
      stage: LeadStage.WON,
      assignedToKey: 'salesman1',
      notes: 'Converted — now billed through Patel Traders.',
    },
    {
      key: 'L_JMN_1',
      type: LeadType.DISTRIBUTOR,
      name: 'Sagar Bhatt',
      firmName: 'Bhatt Agencies',
      phone: '+919833000501',
      townKey: 'JMN_DHROL',
      districtCode: 'JMN',
      source: LeadSource.REFERRAL,
      stage: LeadStage.LOST,
      assignedToKey: 'salesman2',
      notes: 'Went with a competitor.',
      lostReason: 'Competitor offered a higher margin',
    },
  ];

  const today = dateOnly(new Date());

  for (const lead of leads) {
    const assignedToId = lead.assignedToKey ? sid('user', lead.assignedToKey) : null;
    const base = {
      type: lead.type,
      name: lead.name,
      firmName: lead.firmName ?? null,
      phone: lead.phone,
      townId: townId(lead.townKey),
      districtId: districtId(lead.districtCode),
      source: lead.source,
      stage: lead.stage,
      lostReason: lead.lostReason ?? null,
      assignedToId,
      expectedInvestment: lead.expectedInvestment ?? null,
      followUpAt: lead.followUpInDays === undefined ? null : addDays(today, lead.followUpInDays),
      notes: lead.notes,
      convertedAt: lead.stage === LeadStage.WON ? addDays(today, -6) : null,
    };

    await prisma.lead.upsert({
      where: { id: sid('lead', lead.key) },
      create: { id: sid('lead', lead.key), ...base },
      update: base,
    });

    await prisma.leadActivity.upsert({
      where: { id: sid('leadact', `${lead.key}_1`) },
      create: {
        id: sid('leadact', `${lead.key}_1`),
        leadId: sid('lead', lead.key),
        userId: assignedToId ?? adminId,
        type: LeadActivityType.NOTE,
        note: 'Lead created from the field.',
        at: addDays(today, -12),
      },
      update: {},
    });

    if (lead.stage !== LeadStage.NEW) {
      await prisma.leadActivity.upsert({
        where: { id: sid('leadact', `${lead.key}_2`) },
        create: {
          id: sid('leadact', `${lead.key}_2`),
          leadId: sid('lead', lead.key),
          userId: assignedToId ?? adminId,
          type: LeadActivityType.STAGE_CHANGE,
          note: `Stage moved to ${lead.stage}.`,
          at: addDays(today, -5),
        },
        update: {},
      });
    }
  }

  console.log(`  leads: ${leads.length}`);
}

async function seedTerritoriesAndBeats() {
  const territories = [
    { key: 'T1', salesmanKey: 'salesman1', districtCode: 'RJT' },
    { key: 'T2', salesmanKey: 'salesman1', districtCode: 'MRB' },
    { key: 'T3', salesmanKey: 'salesman2', districtCode: 'JMN' },
    { key: 'T4', salesmanKey: 'salesman2', districtCode: 'JNG' },
    { key: 'T5', salesmanKey: 'salesman2', districtCode: 'PRB' },
  ];

  for (const t of territories) {
    // Matched on what the row means, not its id: the admin can replace a
    // territory (new ids), and a re-seed must not trip the unique constraint.
    await prisma.salesmanTerritory.upsert({
      where: {
        salesmanId_districtId: {
          salesmanId: sid('user', t.salesmanKey),
          districtId: districtId(t.districtCode),
        },
      },
      create: {
        id: sid('territory', t.key),
        salesmanId: sid('user', t.salesmanKey),
        districtId: districtId(t.districtCode),
      },
      update: {},
    });
  }

  const beats = [
    {
      key: 'B1',
      name: 'Rajkot City Beat',
      salesmanKey: 'salesman1',
      dayOfWeek: 1,
      stops: ['RT_RJT_1', 'RT_RJT_2'],
    },
    {
      key: 'B2',
      name: 'Gondal - Jetpur Beat',
      salesmanKey: 'salesman1',
      dayOfWeek: 3,
      stops: ['RT_RJT_3', 'RT_RJT_4', 'RT_RJT_5'],
    },
    {
      key: 'B3',
      name: 'Jamnagar City Beat',
      salesmanKey: 'salesman2',
      dayOfWeek: 2,
      stops: ['RT_JMN_1', 'RT_JMN_2'],
    },
    {
      key: 'B4',
      name: 'Junagadh Beat',
      salesmanKey: 'salesman2',
      dayOfWeek: 4,
      stops: ['RT_JNG_1', 'RT_JNG_2', 'RT_JNG_3'],
    },
  ];

  for (const beat of beats) {
    await prisma.beat.upsert({
      where: { id: sid('beat', beat.key) },
      create: {
        id: sid('beat', beat.key),
        name: beat.name,
        salesmanId: sid('user', beat.salesmanKey),
        dayOfWeek: beat.dayOfWeek,
      },
      update: { name: beat.name, dayOfWeek: beat.dayOfWeek },
    });

    for (const [index, retailerKey] of beat.stops.entries()) {
      const retailer = RETAILERS.find((r) => r.key === retailerKey)!;
      await prisma.beatStop.upsert({
        where: { id: sid('beatstop', `${beat.key}_${index}`) },
        create: {
          id: sid('beatstop', `${beat.key}_${index}`),
          beatId: sid('beat', beat.key),
          retailerId: sid('retailer', retailerKey),
          townId: townId(retailer.townKey),
          sequence: index + 1,
        },
        update: { sequence: index + 1 },
      });
    }
  }

  console.log(`  territories: ${territories.length}, beats: ${beats.length}`);
}

async function seedSalaryAndIncentives(adminId: string) {
  const structures = [
    { key: 'S1', salesmanKey: 'salesman1', basic: 18000, hra: 6000, fixedAllowance: 3000 },
    { key: 'S2', salesmanKey: 'salesman2', basic: 16000, hra: 5000, fixedAllowance: 2500 },
  ];

  for (const s of structures) {
    await prisma.salaryStructure.upsert({
      where: { id: sid('salary', s.key) },
      create: {
        id: sid('salary', s.key),
        salesmanId: sid('user', s.salesmanKey),
        basic: s.basic,
        hra: s.hra,
        fixedAllowance: s.fixedAllowance,
        effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
      },
      update: { basic: s.basic, hra: s.hra, fixedAllowance: s.fixedAllowance },
    });
  }

  // The month the seeded field history falls in, so its cost report has an incentive.
  const month = addDays(new Date(), -Math.ceil(HISTORY_DAYS / 2))
    .toISOString()
    .slice(0, 7);

  await prisma.incentive.upsert({
    where: { id: sid('incentive', 'I1') },
    create: {
      id: sid('incentive', 'I1'),
      salesmanId: sid('user', 'salesman1'),
      month,
      amount: 2500,
      reason: 'Exceeded the monthly order target for Rajkot',
      createdById: adminId,
    },
    update: { month, amount: 2500 },
  });

  console.log(`  salary structures: ${structures.length}, incentives: 1`);
}

interface DayPlan {
  salesmanKey: 'salesman1' | 'salesman2';
  retailerKeys: string[];
  hqTownKey: string;
}

const DAY_PLANS: Record<'salesman1' | 'salesman2', DayPlan> = {
  salesman1: {
    salesmanKey: 'salesman1',
    retailerKeys: ['RT_RJT_1', 'RT_RJT_2', 'RT_RJT_3', 'RT_RJT_4', 'RT_RJT_5'],
    hqTownKey: 'RJT_RAJKOT',
  },
  salesman2: {
    salesmanKey: 'salesman2',
    retailerKeys: ['RT_JMN_1', 'RT_JMN_2', 'RT_JMN_3', 'RT_JNG_1', 'RT_JNG_2', 'RT_JNG_3'],
    hqTownKey: 'JMN_JAMNAGAR',
  },
};

async function seedFieldHistory(policy: {
  daHq: number;
  daExHq: number;
  daOutstation: number;
  taPerKmBike: number;
}) {
  const retailerRows = await prisma.retailer.findMany({
    where: { id: { startsWith: 'seed_retailer_' } },
    select: { id: true, townId: true, lat: true, lng: true, distributorId: true, shopName: true },
  });
  const retailerById = new Map(retailerRows.map((r) => [r.id, r]));
  const products = await prisma.product.findMany({
    where: { id: { startsWith: 'seed_product_' } },
  });

  const today = dateOnly(new Date());
  // Highest sequence used per `YYMM`, so Phase 5 allocates real order numbers
  // above everything the seed wrote.
  const orderSeq = new Map<string, number>();
  let odometer = 18_400;

  const counters = { workDays: 0, visits: 0, orders: 0, pings: 0, expenses: 0 };

  for (const planKey of ['salesman1', 'salesman2'] as const) {
    const plan = DAY_PLANS[planKey];
    const salesmanId = sid('user', plan.salesmanKey);
    const hqTown = TOWNS.find((t) => t.key === plan.hqTownKey)!;

    for (let offset = HISTORY_DAYS; offset >= 1; offset--) {
      const day = addDays(today, -offset);
      const dayKey = day.toISOString().slice(0, 10).replace(/-/g, '');
      const workDayId = sid('workday', `${plan.salesmanKey}_${dayKey}`);
      const isSunday = day.getUTCDay() === 0;
      // One leave day and one day the salesman forgot to close, so the admin
      // calendar and the flag list both have something to show.
      const isLeave = offset === 6;
      const notEnded = offset === 3;

      if (isSunday || isLeave) {
        await prisma.workDay.upsert({
          where: { id: workDayId },
          create: {
            id: workDayId,
            salesmanId,
            date: day,
            dayType: isSunday ? DayType.HOLIDAY : DayType.LEAVE,
            status: WorkDayStatus.APPROVED,
            endedProperly: true,
            remarks: isSunday ? 'Weekly off' : 'Casual leave',
          },
          update: {},
        });
        counters.workDays++;
        continue;
      }

      // Rotate through all three working day types so every DA tier in the
      // allowance policy is exercised by the demo data.
      const dayType: DayType =
        offset % 7 === 3 ? DayType.OUTSTATION : offset % 5 === 0 ? DayType.EX_HQ : DayType.HQ;
      const startAt = atIst(day, 9, randomInt(rand, 5, 35));
      const endAt = notEnded ? null : atIst(day, 18, randomInt(rand, 10, 50));
      const visitCount = randomInt(rand, 3, 5);
      const visitRetailers = plan.retailerKeys.slice(0, visitCount);

      const startKm = odometer;
      const drivenKm = randomInt(rand, 38, 120);
      odometer += drivenKm;
      // Keep GPS slightly below the odometer, except on one day where the gap is
      // wide enough to trip the 1.3x flag.
      const gpsKm = round2(offset === 9 ? drivenKm / 1.8 : drivenKm / (1.05 + rand() * 0.15));

      const startPoint = { lat: jitter(rand, hqTown.lat, 800), lng: jitter(rand, hqTown.lng, 800) };

      await prisma.workDay.upsert({
        where: { id: workDayId },
        create: {
          id: workDayId,
          salesmanId,
          date: day,
          dayType,
          startAt,
          startLat: startPoint.lat,
          startLng: startPoint.lng,
          startAccuracyM: randomInt(rand, 8, 45),
          startPlaceLabel: hqTown.name,
          startOdometer: startKm,
          endAt,
          endLat: endAt ? jitter(rand, hqTown.lat, 2500) : null,
          endLng: endAt ? jitter(rand, hqTown.lng, 2500) : null,
          endAccuracyM: endAt ? randomInt(rand, 8, 45) : null,
          endPlaceLabel: endAt ? hqTown.name : null,
          endOdometer: endAt ? startKm + drivenKm : null,
          totalKm: endAt ? drivenKm : null,
          gpsKm,
          endedProperly: Boolean(endAt),
          workingMinutes: endAt ? Math.round((endAt.getTime() - startAt.getTime()) / 60000) : null,
          status: notEnded
            ? WorkDayStatus.OPEN
            : offset <= 4
              ? WorkDayStatus.SUBMITTED
              : WorkDayStatus.APPROVED,
          submittedAt: endAt ?? null,
          remarks: notEnded ? 'Day was never closed by the salesman.' : null,
          townsVisited: {
            connect: [
              ...new Set(visitRetailers.map((k) => RETAILERS.find((r) => r.key === k)!.townKey)),
            ].map((key) => ({ id: townId(key) })),
          },
        },
        update: {},
      });
      counters.workDays++;

      // Location pings every 10 minutes while the app would have been open.
      const pingEnd = endAt ?? atIst(day, 15, 0);
      const pings: {
        id: string;
        workDayId: string;
        salesmanId: string;
        lat: number;
        lng: number;
        accuracyM: number;
        source: PingSource;
        capturedAt: Date;
      }[] = [];
      let pingIndex = 0;
      for (let t = startAt.getTime(); t <= pingEnd.getTime(); t += 10 * 60 * 1000) {
        pings.push({
          id: sid('ping', `${plan.salesmanKey}_${dayKey}_${pingIndex}`),
          workDayId,
          salesmanId,
          lat: jitter(rand, hqTown.lat, 9000),
          lng: jitter(rand, hqTown.lng, 9000),
          accuracyM: randomInt(rand, 6, 60),
          source: pingIndex === 0 ? PingSource.START : PingSource.TIMER,
          capturedAt: new Date(t),
        });
        pingIndex++;
      }
      const pingResult = await prisma.locationPing.createMany({
        data: pings,
        skipDuplicates: true,
      });
      counters.pings += pingResult.count;

      for (const [index, retailerKey] of visitRetailers.entries()) {
        const retailer = retailerById.get(sid('retailer', retailerKey));
        if (!retailer) continue;

        const visitId = sid('visit', `${plan.salesmanKey}_${dayKey}_${index}`);
        const checkInAt = atIst(day, 10 + index * 2, randomInt(rand, 0, 50));
        const shopPoint = { lat: Number(retailer.lat), lng: Number(retailer.lng) };
        // Most check-ins are right at the shop; one is far enough away to be flagged.
        const offMeters = index === 2 && offset === 5 ? 650 : randomInt(rand, 5, 90);
        const checkIn = {
          lat: jitter(rand, shopPoint.lat, offMeters),
          lng: jitter(rand, shopPoint.lng, offMeters),
        };
        const tookOrder = rand() > 0.35;

        const visit = await prisma.visit.upsert({
          where: { id: visitId },
          create: {
            id: visitId,
            workDayId,
            salesmanId,
            retailerId: retailer.id,
            townId: retailer.townId,
            checkInAt,
            checkInLat: checkIn.lat,
            checkInLng: checkIn.lng,
            checkOutAt: new Date(checkInAt.getTime() + randomInt(rand, 8, 25) * 60000),
            distanceFromShopMeters: haversineMeters(shopPoint, checkIn),
            outcome: tookOrder
              ? VisitOutcome.ORDER_TAKEN
              : pick(rand, [
                  VisitOutcome.NO_ORDER,
                  VisitOutcome.SHOP_CLOSED,
                  VisitOutcome.FOLLOW_UP,
                ]),
            noOrderReason: tookOrder
              ? null
              : pick(rand, [
                  'Stock still available',
                  'Owner not present',
                  'Asked to come next week',
                ]),
            notes: tookOrder
              ? 'Shelf restocked and order confirmed.'
              : 'Will follow up on the next beat.',
          },
          update: {},
        });
        counters.visits++;

        await prisma.visitPhoto.upsert({
          where: { id: sid('visitphoto', `${plan.salesmanKey}_${dayKey}_${index}`) },
          create: {
            id: sid('visitphoto', `${plan.salesmanKey}_${dayKey}_${index}`),
            visitId,
            url: `visits/${salesmanId}/${day.toISOString().slice(0, 7)}/${visitId}-shelf.jpg`,
            type: VisitPhotoType.SHELF,
            capturedAt: checkInAt,
            lat: checkIn.lat,
            lng: checkIn.lng,
          },
          update: {},
        });

        // Follow the stored outcome, not this run's dice: a re-seed on a later date
        // draws different numbers, and an existing NO_ORDER visit must not gain an order.
        if (visit.outcome !== VisitOutcome.ORDER_TAKEN) continue;

        // Derived from the order's own identity rather than a running counter, so
        // re-seeding never renumbers (and collides with) an existing order.
        const seq = day.getUTCDate() * 100 + (plan.salesmanKey === 'salesman1' ? 0 : 50) + index;
        const monthKey = `${String(day.getUTCFullYear()).slice(2)}${String(day.getUTCMonth() + 1).padStart(2, '0')}`;
        orderSeq.set(monthKey, Math.max(orderSeq.get(monthKey) ?? 0, seq));

        const orderId = sid('order', `${plan.salesmanKey}_${dayKey}_${index}`);
        const lineProducts = products.slice(0, randomInt(rand, 2, 4));
        const items = lineProducts.map((product) => {
          const qtyCases = randomInt(rand, 1, 6);
          const rate = Number(product.retailerPrice);
          const amount = round2(qtyCases * product.unitsPerCase * rate);
          return { product, qtyCases, rate, amount };
        });
        const totalAmount = round2(items.reduce((sum, i) => sum + i.amount, 0));

        await prisma.order.upsert({
          where: { id: orderId },
          create: {
            id: orderId,
            level: OrderLevel.DISTRIBUTOR_TO_RETAILER,
            fromPartyType: PartyType.DISTRIBUTOR,
            toPartyType: PartyType.RETAILER,
            distributorId: retailer.distributorId,
            retailerId: retailer.id,
            orderNumber: orderNumber(day, seq),
            status:
              offset > 7
                ? OrderStatus.DELIVERED
                : offset > 3
                  ? OrderStatus.DISPATCHED
                  : OrderStatus.CONFIRMED,
            totalAmount,
            takenBySalesmanId: salesmanId,
            visitId,
            orderDate: checkInAt,
            expectedDelivery: addDays(day, 3),
            items: {
              create: items.map((i, itemIndex) => ({
                id: sid('orderitem', `${plan.salesmanKey}_${dayKey}_${index}_${itemIndex}`),
                productId: i.product.id,
                qtyCases: i.qtyCases,
                // Whole cases only; `qtyUnits` is loose units on top of the cases.
                qtyUnits: 0,
                rate: i.rate,
                amount: i.amount,
              })),
            },
            statusLogs: {
              create: {
                id: sid('orderlog', `${plan.salesmanKey}_${dayKey}_${index}`),
                status: OrderStatus.PLACED,
                changedById: salesmanId,
                note: 'Order taken during field visit.',
                at: checkInAt,
              },
            },
          },
          update: {},
        });
        await seedStatusTrail(orderId, {
          finalStatus:
            offset > 7
              ? OrderStatus.DELIVERED
              : offset > 3
                ? OrderStatus.DISPATCHED
                : OrderStatus.CONFIRMED,
          placedAt: checkInAt,
          adminId: sid('user', 'admin'),
        });
        counters.orders++;
      }

      if (!endAt) continue;

      // End-of-day auto-drafted TA/DA, exactly as the Phase 6 flow will create it.
      const daAmount =
        dayType === DayType.OUTSTATION
          ? policy.daOutstation
          : dayType === DayType.EX_HQ
            ? policy.daExHq
            : policy.daHq;
      const approved = offset > 4;

      const claims = [
        {
          suffix: 'da',
          category: ExpenseCategory.DA,
          travelMode: null,
          km: null,
          amount: daAmount,
        },
        {
          suffix: 'ta',
          category: ExpenseCategory.TA,
          travelMode: TravelMode.BIKE,
          km: drivenKm,
          amount: round2(drivenKm * policy.taPerKmBike),
        },
      ];

      for (const claim of claims) {
        await prisma.expenseClaim.upsert({
          where: { id: sid('expense', `${plan.salesmanKey}_${dayKey}_${claim.suffix}`) },
          create: {
            id: sid('expense', `${plan.salesmanKey}_${dayKey}_${claim.suffix}`),
            salesmanId,
            workDayId,
            date: day,
            category: claim.category,
            travelMode: claim.travelMode,
            km: claim.km,
            amountClaimed: claim.amount,
            amountApproved: approved ? claim.amount : null,
            status: approved ? ExpenseStatus.APPROVED : ExpenseStatus.SUBMITTED,
            reviewedById: approved ? sid('user', 'admin') : null,
            reviewedAt: approved ? addDays(day, 1) : null,
            isAutoDrafted: true,
            billPhotoUrls: [],
          },
          update: {},
        });
        counters.expenses++;
      }

      // An occasional out-of-policy claim with a bill, so the approval queue has
      // something worth reviewing.
      if (offset % 7 === 2) {
        await prisma.expenseClaim.upsert({
          where: { id: sid('expense', `${plan.salesmanKey}_${dayKey}_misc`) },
          create: {
            id: sid('expense', `${plan.salesmanKey}_${dayKey}_misc`),
            salesmanId,
            workDayId,
            date: day,
            category: ExpenseCategory.LODGING,
            amountClaimed: 1250,
            status: ExpenseStatus.SUBMITTED,
            isAutoDrafted: false,
            billPhotoUrls: [
              `bills/${salesmanId}/${day.toISOString().slice(0, 7)}/${dayKey}-lodging.jpg`,
            ],
            adminRemark: null,
          },
          update: {},
        });
        counters.expenses++;
      }
    }
  }

  // Raise the per-month high-water mark, never lower it: lowering it on a
  // re-seed would hand out numbers already used by orders placed since.
  for (const [month, lastSeq] of orderSeq) {
    const existing = await prisma.orderSequence.findUnique({ where: { month } });
    await prisma.orderSequence.upsert({
      where: { month },
      create: { month, lastSeq },
      update: { lastSeq: Math.max(existing?.lastSeq ?? 0, lastSeq) },
    });
  }

  console.log(
    `  field history: ${counters.workDays} work days, ${counters.visits} visits, ${counters.orders} orders, ${counters.pings} pings, ${counters.expenses} expense claims`,
  );
}

async function seedCompanyOrders() {
  const products = await prisma.product.findMany({
    where: { id: { startsWith: 'seed_product_' } },
  });
  const today = dateOnly(new Date());

  for (const [index, ss] of SUPER_STOCKISTS.entries()) {
    const orderDate = addDays(today, -(10 + index));
    const items = products.slice(0, 3).map((product) => {
      const qtyCases = randomInt(rand, 20, 60);
      const rate = Number(product.ssPrice);
      return {
        product,
        qtyCases,
        rate,
        amount: round2(qtyCases * product.unitsPerCase * rate),
      };
    });

    await prisma.order.upsert({
      where: { id: sid('order', `company_${ss.key}`) },
      create: {
        id: sid('order', `company_${ss.key}`),
        level: OrderLevel.COMPANY_TO_SS,
        fromPartyType: PartyType.COMPANY,
        toPartyType: PartyType.SUPER_STOCKIST,
        superStockistId: sid('ss', ss.key),
        // 9000+ keeps company orders clear of the field range (max 3155 above).
        orderNumber: orderNumber(orderDate, 9000 + index),
        status: OrderStatus.DELIVERED,
        totalAmount: round2(items.reduce((sum, i) => sum + i.amount, 0)),
        orderDate,
        expectedDelivery: addDays(orderDate, 4),
        notes: 'Monthly replenishment.',
        items: {
          create: items.map((i, itemIndex) => ({
            id: sid('orderitem', `company_${ss.key}_${itemIndex}`),
            productId: i.product.id,
            qtyCases: i.qtyCases,
            // Whole cases only; `qtyUnits` is loose units on top of the cases.
            qtyUnits: 0,
            rate: i.rate,
            amount: i.amount,
          })),
        },
        statusLogs: {
          create: {
            id: sid('orderlog', `company_${ss.key}`),
            status: OrderStatus.DELIVERED,
            changedById: sid('user', 'admin'),
            note: 'Delivered to the super stockist godown.',
            at: addDays(orderDate, 4),
          },
        },
      },
      update: {},
    });
    await seedStatusTrail(sid('order', `company_${ss.key}`), {
      finalStatus: OrderStatus.DELIVERED,
      placedAt: orderDate,
      adminId: sid('user', 'admin'),
      // The DELIVERED entry above predates the trail; keep it as the last step.
      skip: [OrderStatus.DELIVERED],
    });
  }

  console.log(`  company orders: ${SUPER_STOCKISTS.length}`);
}

/**
 * SS -> distributor orders, so the middle of the chain has history too: one
 * delivered and one open per distributor, plus one cancelled (SPEC 4.4).
 */
async function seedChainOrders() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { sku: 'asc' },
  });
  const today = dateOnly(new Date());
  const adminId = sid('user', 'admin');
  let count = 0;

  for (const [index, d] of DISTRIBUTORS.entries()) {
    const plans = [
      { key: 'a', daysAgo: 12 + index, status: OrderStatus.DELIVERED, note: null },
      {
        key: 'b',
        daysAgo: 2 + index,
        status: index === 0 ? OrderStatus.CANCELLED : OrderStatus.CONFIRMED,
        note: index === 0 ? 'Distributor asked to hold until the festival stock clears.' : null,
      },
    ];
    for (const plan of plans) {
      const orderId = sid('order', `chain_${d.key}_${plan.key}`);
      const orderDate = atIst(addDays(today, -plan.daysAgo), 11);
      const items = products.slice(index, index + 3).map((product, itemIndex) => {
        const qtyCases = randomInt(rand, 8, 25);
        const rate = Number(product.distributorPrice);
        return {
          product,
          itemIndex,
          qtyCases,
          rate,
          amount: round2(qtyCases * product.unitsPerCase * rate),
        };
      });
      await prisma.order.upsert({
        where: { id: orderId },
        create: {
          id: orderId,
          level: OrderLevel.SS_TO_DISTRIBUTOR,
          fromPartyType: PartyType.SUPER_STOCKIST,
          toPartyType: PartyType.DISTRIBUTOR,
          superStockistId: sid('ss', d.superStockistKey),
          distributorId: sid('distributor', d.key),
          // 8000+ keeps these clear of the field and company ranges.
          orderNumber: orderNumber(orderDate, 8000 + index * 10 + (plan.key === 'a' ? 0 : 1)),
          status: plan.status,
          totalAmount: round2(items.reduce((sum, i) => sum + i.amount, 0)),
          orderDate,
          expectedDelivery: addDays(orderDate, 3),
          items: {
            create: items.map((i) => ({
              id: sid('orderitem', `chain_${d.key}_${plan.key}_${i.itemIndex}`),
              productId: i.product.id,
              qtyCases: i.qtyCases,
              qtyUnits: 0,
              rate: i.rate,
              amount: i.amount,
            })),
          },
        },
        update: {},
      });
      await seedStatusTrail(orderId, {
        finalStatus: plan.status,
        placedAt: orderDate,
        adminId,
        note: plan.note,
      });
      count++;
    }
  }
  console.log(`  chain orders (SS -> distributor): ${count}`);
}

/**
 * One status-log entry per step from PLACED to `finalStatus`, a day apart, so
 * every seeded order has a complete timeline. Ids are deterministic, so a
 * re-seed fills gaps in older data without duplicating anything.
 */
async function seedStatusTrail(
  orderId: string,
  opts: {
    finalStatus: OrderStatus;
    placedAt: Date;
    adminId: string;
    note?: string | null;
    skip?: OrderStatus[];
  },
) {
  const path: OrderStatus[] =
    opts.finalStatus === OrderStatus.CANCELLED
      ? [OrderStatus.PLACED, OrderStatus.CANCELLED]
      : ORDER_STATUS_FLOW.slice(0, ORDER_STATUS_FLOW.indexOf(opts.finalStatus) + 1);
  const existingPlaced = await prisma.orderStatusLog.findFirst({
    where: { orderId, status: OrderStatus.PLACED },
  });

  // A day per step, squeezed for recent orders so no step lands in the future.
  const stepMs = Math.min(86_400_000, (Date.now() - opts.placedAt.getTime()) / path.length);

  for (const [step, status] of path.entries()) {
    if (opts.skip?.includes(status)) continue;
    if (status === OrderStatus.PLACED && existingPlaced) continue;
    const id = `${orderId}_log_${status}`;
    await prisma.orderStatusLog.upsert({
      where: { id },
      create: {
        id,
        orderId,
        status,
        changedById: opts.adminId,
        note: status === OrderStatus.CANCELLED ? (opts.note ?? 'Cancelled') : null,
        at: new Date(opts.placedAt.getTime() + step * stepMs),
      },
      update: { at: new Date(opts.placedAt.getTime() + step * stepMs) },
    });
  }
}

async function seedNotifications() {
  await prisma.notification.upsert({
    where: { id: sid('notification', 'N1') },
    create: {
      id: sid('notification', 'N1'),
      userId: sid('user', 'admin'),
      title: 'Expense claims awaiting approval',
      body: 'Ramesh Chauhan and Suresh Makwana have submitted claims for review.',
      link: '/admin/expenses',
    },
    update: {},
  });
  console.log('  notifications: 1');
}

/**
 * Go-live (`SEED_SCOPE=base`): only what a real install needs. Gujarat's
 * districts and towns, the allowance policy (edit it in Settings), and one
 * admin from ADMIN_NAME / ADMIN_PHONE / ADMIN_PASSWORD. No demo partners,
 * salesmen, orders or history.
 */
async function seedBase() {
  const name = process.env.ADMIN_NAME?.trim();
  const phone = process.env.ADMIN_PHONE?.trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!name || !phone || !/^\+91[6-9]\d{9}$/.test(phone) || password.length < 8) {
    throw new Error(
      'SEED_SCOPE=base needs ADMIN_NAME, ADMIN_PHONE (+91XXXXXXXXXX) and ADMIN_PASSWORD (8+ characters)',
    );
  }
  console.log('Seeding base data for a live install...');
  await seedDistricts();
  await seedTowns();
  await seedAllowancePolicy();
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log(`  admin ${phone} already exists; left as it is`);
  } else {
    const hqTown = await prisma.town.findFirstOrThrow({ where: { name: 'Ahmedabad' } });
    await prisma.user.create({
      data: {
        name,
        phone,
        passwordHash: await bcrypt.hash(password, 12),
        role: Role.ADMIN,
        joiningDate: new Date(),
        hqTownId: hqTown.id,
      },
    });
    console.log(`  admin ${phone} created`);
  }
  await recomputeAllCoverage(prisma);
  console.log('\nBase seed complete. Sign in as the admin and add products, users and partners.');
}

async function main() {
  if (process.env.SEED_SCOPE === 'base') return seedBase();
  console.log('Seeding Juma development data...');

  await seedDistricts();
  await seedTowns();
  const { admin } = await seedUsers();
  await seedProducts();
  const policy = await seedAllowancePolicy();
  await seedPartners();
  await seedLeads(admin.id);
  await seedTerritoriesAndBeats();
  await seedSalaryAndIncentives(admin.id);
  await seedFieldHistory(policy);
  // Earlier seeds stored total units in `qtyUnits`; it means loose units.
  await prisma.orderItem.updateMany({
    where: { id: { startsWith: 'seed_orderitem_' } },
    data: { qtyUnits: 0 },
  });
  await seedCompanyOrders();
  await seedChainOrders();
  await seedNotifications();

  await recomputeAllCoverage(prisma);
  const coverage = await prisma.district.groupBy({
    by: ['coverageStatus'],
    _count: { _all: true },
  });
  console.log(
    `  coverage: ${coverage.map((c) => `${c.coverageStatus}=${c._count._all}`).join(', ')}`,
  );

  console.log('\nSeed complete.');
  console.log(`  Admin login    +919812300001 / ${DEFAULT_PASSWORD}`);
  console.log(`  Salesman login +919812300002 / ${DEFAULT_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
