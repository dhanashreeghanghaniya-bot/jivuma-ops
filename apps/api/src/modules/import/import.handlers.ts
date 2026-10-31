import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ImportEntity,
  LeadSource,
  LeadStage,
  LeadType,
  PartnerStatus,
  RetailerCategory,
  TownType,
  createDistributorSchema,
  createProductSchema,
  createRetailerSchema,
  createSuperStockistSchema,
  createTownSchema,
  enumValues,
  phoneSchema,
  updateDistrictSchema,
  type ImportRow,
  type ImportRowIssue,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { productData } from '../orders/products.service';
import type { EntityHandler, ImportContext, RowOutcome } from './import.types';

const cell = (row: ImportRow, key: string): string => (row[key] ?? '').trim();
/** Empty cells mean "not provided", which Zod optionals understand. */
const optional = (row: ImportRow, key: string): string | undefined => cell(row, key) || undefined;

const townKey = (districtId: string, name: string) => `${districtId}::${name.trim().toLowerCase()}`;

/** Flattens Zod issues onto the sheet columns the user actually sees. */
function zodIssues(error: z.ZodError, columnFor: Record<string, string> = {}): ImportRowIssue[] {
  return error.issues.map((issue) => {
    const field = issue.path.join('.') || 'row';
    return { column: columnFor[field] ?? field, message: issue.message };
  });
}

const fail = (issues: ImportRowIssue[]): RowOutcome<never> => ({
  issues,
  summary: '',
  isUpdate: false,
});

/** Resolves `districtCode` + `townName` to a town, collecting readable errors. */
function resolveTown(
  row: ImportRow,
  ctx: ImportContext,
  codeColumn = 'districtCode',
  nameColumn = 'townName',
): { townId?: string; districtId?: string; label?: string; issues: ImportRowIssue[] } {
  const code = cell(row, codeColumn).toUpperCase();
  const name = cell(row, nameColumn);

  if (!code) return { issues: [{ column: codeColumn, message: 'Required' }] };
  const district = ctx.districtsByCode.get(code);
  if (!district) return { issues: [{ column: codeColumn, message: `Unknown district code "${code}"` }] };

  if (!name) return { issues: [{ column: nameColumn, message: 'Required' }] };
  const town = ctx.townsByDistrictAndName.get(townKey(district.id, name));
  if (!town) {
    return {
      issues: [
        { column: nameColumn, message: `"${name}" is not a town in ${district.name}. Import towns first.` },
      ],
    };
  }

  return {
    townId: town.id,
    districtId: district.id,
    label: `${town.name}, ${district.name}`,
    issues: [],
  };
}

const enumCell = <T extends Record<string, string>>(
  values: T,
  value: string | undefined,
  fallback: string,
) => (value ? value.toUpperCase() : fallback) as T[keyof T];

// ---------------------------------------------------------------------------
// districts
// ---------------------------------------------------------------------------

interface DistrictRow {
  id: string;
  data: z.infer<typeof updateDistrictSchema>;
}

const districtsHandler: EntityHandler<DistrictRow> = {
  parseRow: (row, ctx) => {
    const code = cell(row, 'code').toUpperCase();
    if (!code) return fail([{ column: 'code', message: 'Required' }]);

    const district = ctx.districtsByCode.get(code);
    if (!district) {
      return fail([
        { column: 'code', message: `Unknown district code "${code}". Districts cannot be created.` },
      ]);
    }

    const parsed = updateDistrictSchema.safeParse({
      nameGu: optional(row, 'nameGu'),
      lat: optional(row, 'lat'),
      lng: optional(row, 'lng'),
      zone: optional(row, 'zone')?.toUpperCase(),
    });
    if (!parsed.success) return fail(zodIssues(parsed.error));

    return {
      issues: [],
      value: { id: district.id, data: parsed.data },
      summary: `Update ${district.name}`,
      isUpdate: true,
    };
  },
  apply: async (values) => {
    for (const { id, data } of values) {
      await prisma.district.update({
        where: { id },
        data: {
          ...(data.nameGu === undefined ? {} : { nameGu: data.nameGu }),
          ...(data.lat === undefined ? {} : { lat: new Prisma.Decimal(data.lat) }),
          ...(data.lng === undefined ? {} : { lng: new Prisma.Decimal(data.lng) }),
          ...(data.zone === undefined ? {} : { zone: data.zone }),
        },
      });
    }
    return { created: 0, updated: values.length };
  },
};

// ---------------------------------------------------------------------------
// towns
// ---------------------------------------------------------------------------

type TownValue = z.infer<typeof createTownSchema> & { existingId?: string };

const townsHandler: EntityHandler<TownValue> = {
  parseRow: (row, ctx) => {
    const code = cell(row, 'districtCode').toUpperCase();
    if (!code) return fail([{ column: 'districtCode', message: 'Required' }]);
    const district = ctx.districtsByCode.get(code);
    if (!district) {
      return fail([{ column: 'districtCode', message: `Unknown district code "${code}"` }]);
    }

    const parsed = createTownSchema.safeParse({
      name: cell(row, 'name'),
      districtId: district.id,
      lat: optional(row, 'lat'),
      lng: optional(row, 'lng'),
      type: enumCell(TownType, optional(row, 'type'), TownType.TOWN),
      population: optional(row, 'population'),
    });
    if (!parsed.success) {
      return fail(zodIssues(parsed.error, { districtId: 'districtCode', population: 'population' }));
    }

    const existing = ctx.townsByDistrictAndName.get(townKey(district.id, parsed.data.name));
    return {
      issues: [],
      value: { ...parsed.data, existingId: existing?.id },
      summary: `${existing ? 'Update' : 'Create'} ${parsed.data.name}, ${district.name}`,
      isUpdate: Boolean(existing),
    };
  },
  apply: async (values) => {
    let created = 0;
    let updated = 0;
    for (const value of values) {
      const data = {
        lat: new Prisma.Decimal(value.lat),
        lng: new Prisma.Decimal(value.lng),
        type: value.type,
        population: value.population ?? null,
      };
      if (value.existingId) {
        await prisma.town.update({ where: { id: value.existingId }, data });
        updated++;
      } else {
        await prisma.town.create({
          data: { name: value.name, districtId: value.districtId, ...data },
        });
        created++;
      }
    }
    return { created, updated };
  },
};

// ---------------------------------------------------------------------------
// super stockists
// ---------------------------------------------------------------------------

type SuperStockistValue = z.infer<typeof createSuperStockistSchema> & { existingId?: string };

const superStockistsHandler: EntityHandler<SuperStockistValue> = {
  parseRow: (row, ctx) => {
    const town = resolveTown(row, ctx);
    if (town.issues.length > 0) return fail(town.issues);

    const coveredCodes = cell(row, 'coveredDistrictCodes')
      .split(';')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const unknownCodes = coveredCodes.filter((c) => !ctx.districtsByCode.has(c));
    if (unknownCodes.length > 0) {
      return fail([
        {
          column: 'coveredDistrictCodes',
          message: `Unknown district code(s): ${unknownCodes.join(', ')}`,
        },
      ]);
    }

    const parsed = createSuperStockistSchema.safeParse({
      firmName: cell(row, 'firmName'),
      ownerName: cell(row, 'ownerName'),
      phone: cell(row, 'phone'),
      altPhone: optional(row, 'altPhone'),
      email: optional(row, 'email'),
      gstin: optional(row, 'gstin'),
      address: cell(row, 'address'),
      townId: town.townId,
      status: enumCell(PartnerStatus, optional(row, 'status'), PartnerStatus.ACTIVE),
      coveredDistrictIds: coveredCodes.map((c) => ctx.districtsByCode.get(c)!.id),
    });
    if (!parsed.success) return fail(zodIssues(parsed.error, { townId: 'townName' }));

    const existing = ctx.superStockistsByFirm.get(parsed.data.firmName.toLowerCase());
    return {
      issues: [],
      value: { ...parsed.data, existingId: existing?.id },
      summary: `${existing ? 'Update' : 'Create'} ${parsed.data.firmName} (${town.label})`,
      isUpdate: Boolean(existing),
    };
  },
  apply: async (values) => {
    let created = 0;
    let updated = 0;
    for (const value of values) {
      const data = {
        ownerName: value.ownerName,
        phone: value.phone,
        altPhone: value.altPhone ?? null,
        email: value.email ?? null,
        gstin: value.gstin ?? null,
        address: value.address,
        townId: value.townId,
        status: value.status,
      };
      const districtIds = value.coveredDistrictIds.map((id) => ({ id }));
      if (value.existingId) {
        await prisma.superStockist.update({
          where: { id: value.existingId },
          // `set` replaces the whole relation; only valid on update.
          data: { ...data, coveredDistricts: { set: districtIds } },
        });
        updated++;
      } else {
        await prisma.superStockist.create({
          data: { firmName: value.firmName, ...data, coveredDistricts: { connect: districtIds } },
        });
        created++;
      }
    }
    return { created, updated };
  },
};

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------

type ProductValue = z.infer<typeof createProductSchema>;

const productsHandler: EntityHandler<ProductValue> = {
  parseRow: (row, ctx) => {
    const active = cell(row, 'isActive').toUpperCase();
    if (active && active !== 'YES' && active !== 'NO') {
      return fail([{ column: 'isActive', message: 'Use YES or NO' }]);
    }
    const parsed = createProductSchema.safeParse({
      name: cell(row, 'name'),
      sku: cell(row, 'sku'),
      category: cell(row, 'category'),
      packSize: cell(row, 'packSize'),
      unitsPerCase: cell(row, 'unitsPerCase'),
      mrp: cell(row, 'mrp'),
      retailMargin: cell(row, 'retailMargin'),
      distributorMargin: cell(row, 'distributorMargin'),
      ssMargin: cell(row, 'ssMargin'),
      isActive: active !== 'NO',
    });
    if (!parsed.success) return fail(zodIssues(parsed.error));

    const isUpdate = ctx.existingSkus.has(parsed.data.sku);
    return {
      issues: [],
      value: parsed.data,
      summary: `${isUpdate ? 'Update' : 'Create'} ${parsed.data.name} (${parsed.data.sku})`,
      isUpdate,
    };
  },
  apply: async (values) => {
    const existing = new Set(
      (
        await prisma.product.findMany({
          where: { sku: { in: values.map((v) => v.sku) } },
          select: { sku: true },
        })
      ).map((p) => p.sku),
    );
    let created = 0;
    let updated = 0;
    for (const value of values) {
      const data = productData(value);
      await prisma.product.upsert({
        where: { sku: value.sku },
        create: data,
        update: { ...data, deletedAt: null },
      });
      if (existing.has(value.sku)) updated++;
      else {
        existing.add(value.sku);
        created++;
      }
    }
    return { created, updated };
  },
};

// distributors
// ---------------------------------------------------------------------------

type DistributorValue = z.infer<typeof createDistributorSchema> & { existingId?: string };

const distributorsHandler: EntityHandler<DistributorValue> = {
  parseRow: (row, ctx) => {
    const town = resolveTown(row, ctx);
    if (town.issues.length > 0) return fail(town.issues);

    const ssFirm = cell(row, 'superStockistFirmName');
    if (!ssFirm) return fail([{ column: 'superStockistFirmName', message: 'Required' }]);
    const superStockist = ctx.superStockistsByFirm.get(ssFirm.toLowerCase());
    if (!superStockist) {
      return fail([
        {
          column: 'superStockistFirmName',
          message: `No super stockist named "${ssFirm}". Import super stockists first.`,
        },
      ]);
    }

    const parsed = createDistributorSchema.safeParse({
      firmName: cell(row, 'firmName'),
      ownerName: cell(row, 'ownerName'),
      phone: cell(row, 'phone'),
      altPhone: optional(row, 'altPhone'),
      email: optional(row, 'email'),
      gstin: optional(row, 'gstin'),
      address: cell(row, 'address'),
      townId: town.townId,
      superStockistId: superStockist.id,
      creditLimit: optional(row, 'creditLimit'),
      creditDays: optional(row, 'creditDays'),
      status: enumCell(PartnerStatus, optional(row, 'status'), PartnerStatus.ACTIVE),
      coveredTownIds: [],
    });
    if (!parsed.success) return fail(zodIssues(parsed.error, { townId: 'townName' }));

    const existing = ctx.distributorsByFirm.get(parsed.data.firmName.toLowerCase());
    return {
      issues: [],
      value: { ...parsed.data, existingId: existing?.id },
      summary: `${existing ? 'Update' : 'Create'} ${parsed.data.firmName} (${town.label})`,
      isUpdate: Boolean(existing),
    };
  },
  apply: async (values) => {
    let created = 0;
    let updated = 0;
    for (const value of values) {
      const data = {
        ownerName: value.ownerName,
        phone: value.phone,
        altPhone: value.altPhone ?? null,
        email: value.email ?? null,
        gstin: value.gstin ?? null,
        address: value.address,
        townId: value.townId,
        superStockistId: value.superStockistId,
        creditLimit: value.creditLimit === null || value.creditLimit === undefined
          ? null
          : new Prisma.Decimal(value.creditLimit),
        creditDays: value.creditDays ?? null,
        status: value.status,
      };
      if (value.existingId) {
        await prisma.distributor.update({ where: { id: value.existingId }, data });
        updated++;
      } else {
        await prisma.distributor.create({ data: { firmName: value.firmName, ...data } });
        created++;
      }
    }
    return { created, updated };
  },
};

// ---------------------------------------------------------------------------
// retailers
// ---------------------------------------------------------------------------

type RetailerValue = z.infer<typeof createRetailerSchema> & { existingId?: string };

const retailersHandler: EntityHandler<RetailerValue> = {
  parseRow: (row, ctx) => {
    const town = resolveTown(row, ctx);
    if (town.issues.length > 0) return fail(town.issues);

    const distributorFirm = cell(row, 'distributorFirmName');
    if (!distributorFirm) return fail([{ column: 'distributorFirmName', message: 'Required' }]);
    const distributor = ctx.distributorsByFirm.get(distributorFirm.toLowerCase());
    if (!distributor) {
      return fail([
        {
          column: 'distributorFirmName',
          message: `No distributor named "${distributorFirm}". Import distributors first.`,
        },
      ]);
    }

    const parsed = createRetailerSchema.safeParse({
      shopName: cell(row, 'shopName'),
      ownerName: cell(row, 'ownerName'),
      phone: cell(row, 'phone'),
      address: cell(row, 'address'),
      townId: town.townId,
      lat: optional(row, 'lat'),
      lng: optional(row, 'lng'),
      distributorId: distributor.id,
      category: enumCell(RetailerCategory, optional(row, 'category'), RetailerCategory.KIRANA),
    });
    if (!parsed.success) return fail(zodIssues(parsed.error, { townId: 'townName' }));

    return {
      issues: [],
      value: parsed.data,
      summary: `Create ${parsed.data.shopName} (${town.label})`,
      isUpdate: false,
    };
  },
  apply: async (values, actorId) => {
    let created = 0;
    let updated = 0;
    for (const value of values) {
      // Shop names repeat across towns, so the natural key includes the town.
      const existing = await prisma.retailer.findFirst({
        where: { deletedAt: null, townId: value.townId, shopName: value.shopName },
        select: { id: true },
      });
      const data = {
        ownerName: value.ownerName,
        phone: value.phone,
        address: value.address,
        lat: new Prisma.Decimal(value.lat),
        lng: new Prisma.Decimal(value.lng),
        distributorId: value.distributorId,
        category: value.category,
      };
      if (existing) {
        await prisma.retailer.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.retailer.create({
          data: {
            shopName: value.shopName,
            townId: value.townId,
            isVerified: true,
            verifiedById: actorId,
            verifiedAt: new Date(),
            ...data,
          },
        });
        created++;
      }
    }
    return { created, updated };
  },
};

// ---------------------------------------------------------------------------
// leads
// ---------------------------------------------------------------------------

const leadRowSchema = z.object({
  type: z.enum(enumValues(LeadType) as [string, ...string[]]),
  name: z.string().trim().min(2, 'Name is required').max(120),
  firmName: z.string().trim().max(160).optional(),
  phone: phoneSchema,
  source: z.enum(enumValues(LeadSource) as [string, ...string[]]),
  stage: z.enum(enumValues(LeadStage) as [string, ...string[]]),
  expectedInvestment: z.coerce.number().min(0).max(999_999_999).optional(),
  followUpAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional(),
  notes: z.string().trim().max(2000).optional(),
});

type LeadValue = z.infer<typeof leadRowSchema> & { townId: string; districtId: string };

const leadsHandler: EntityHandler<LeadValue> = {
  parseRow: (row, ctx) => {
    const town = resolveTown(row, ctx);
    if (town.issues.length > 0) return fail(town.issues);

    const parsed = leadRowSchema.safeParse({
      type: cell(row, 'type').toUpperCase(),
      name: cell(row, 'name'),
      firmName: optional(row, 'firmName'),
      phone: cell(row, 'phone'),
      source: enumCell(LeadSource, optional(row, 'source'), LeadSource.FIELD),
      stage: enumCell(LeadStage, optional(row, 'stage'), LeadStage.NEW),
      expectedInvestment: optional(row, 'expectedInvestment'),
      followUpAt: optional(row, 'followUpAt'),
      notes: optional(row, 'notes'),
    });
    if (!parsed.success) return fail(zodIssues(parsed.error));

    return {
      issues: [],
      value: { ...parsed.data, townId: town.townId!, districtId: town.districtId! },
      summary: `Create ${parsed.data.firmName || parsed.data.name} lead (${town.label})`,
      isUpdate: false,
    };
  },
  apply: async (values) => {
    let created = 0;
    let updated = 0;
    for (const value of values) {
      // The same prospect should not be duplicated by re-importing a sheet.
      const existing = await prisma.lead.findFirst({
        where: { deletedAt: null, phone: value.phone, townId: value.townId },
        select: { id: true },
      });
      const data = {
        type: value.type as never,
        name: value.name,
        firmName: value.firmName ?? null,
        source: value.source as never,
        stage: value.stage as never,
        expectedInvestment:
          value.expectedInvestment === undefined ? null : new Prisma.Decimal(value.expectedInvestment),
        followUpAt: value.followUpAt ? new Date(`${value.followUpAt}T00:00:00.000Z`) : null,
        notes: value.notes ?? null,
      };
      if (existing) {
        await prisma.lead.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.lead.create({
          data: { ...data, phone: value.phone, townId: value.townId, districtId: value.districtId },
        });
        created++;
      }
    }
    return { created, updated };
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const HANDLERS: Record<ImportEntity, EntityHandler<any>> = {
  [ImportEntity.DISTRICTS]: districtsHandler,
  [ImportEntity.TOWNS]: townsHandler,
  [ImportEntity.SUPER_STOCKISTS]: superStockistsHandler,
  [ImportEntity.DISTRIBUTORS]: distributorsHandler,
  [ImportEntity.RETAILERS]: retailersHandler,
  [ImportEntity.LEADS]: leadsHandler,
  [ImportEntity.PRODUCTS]: productsHandler,
};

/** One batch of lookups serves every row in the file. */
export async function buildImportContext(): Promise<ImportContext> {
  const [districts, towns, superStockists, distributors, products] = await Promise.all([
    prisma.district.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true } }),
    prisma.town.findMany({ where: { deletedAt: null }, select: { id: true, name: true, districtId: true } }),
    prisma.superStockist.findMany({ where: { deletedAt: null }, select: { id: true, firmName: true } }),
    prisma.distributor.findMany({ where: { deletedAt: null }, select: { id: true, firmName: true } }),
    prisma.product.findMany({ select: { sku: true } }),
  ]);

  return {
    districtsByCode: new Map(districts.map((d) => [d.code.toUpperCase(), { id: d.id, name: d.name }])),
    townsByDistrictAndName: new Map(
      towns.map((t) => [townKey(t.districtId, t.name), { id: t.id, name: t.name }]),
    ),
    superStockistsByFirm: new Map(superStockists.map((s) => [s.firmName.toLowerCase(), s])),
    distributorsByFirm: new Map(distributors.map((d) => [d.firmName.toLowerCase(), d])),
    existingSkus: new Set(products.map((p) => p.sku)),
  };
}