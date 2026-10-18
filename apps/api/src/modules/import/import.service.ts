import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  type ImportCommitResult,
  type ImportEntity,
  type ImportPreview,
  type ImportRow,
  type ImportRowResult,
} from '@juma/shared';
import { prisma } from '../../lib/prisma';
import { ApiException } from '../../lib/http';
import { writeAuditLog } from '../../lib/audit';
import { recomputeAllCoverage } from '../geo/coverage.service';
import { HANDLERS, buildImportContext } from './import.handlers';
import { toCsv } from './import.parse';

/** Validates every row without writing anything (SPEC 3). */
export async function preview(entity: ImportEntity, rows: ImportRow[]): Promise<ImportPreview> {
  const firstRow = rows[0];
  if (!firstRow) throw ApiException.badRequest('The file has no data rows');
  if (rows.length > IMPORT_MAX_ROWS) {
    throw ApiException.badRequest(`Import at most ${IMPORT_MAX_ROWS} rows at a time`);
  }

  const columns = IMPORT_COLUMNS[entity].map((c) => c.key);
  const missingRequired = IMPORT_COLUMNS[entity]
    .filter((c) => c.required && !(c.key in firstRow))
    .map((c) => c.key);
  if (missingRequired.length > 0) {
    throw ApiException.badRequest(
      `The file is missing required column(s): ${missingRequired.join(', ')}. Download the template.`,
    );
  }

  const ctx = await buildImportContext();
  const handler = HANDLERS[entity];

  const results: ImportRowResult[] = rows.map((row, index) => {
    const outcome = handler.parseRow(row, ctx, index + 1);
    return {
      rowNumber: index + 1,
      action: outcome.issues.length > 0 ? 'ERROR' : outcome.isUpdate ? 'UPDATE' : 'CREATE',
      issues: outcome.issues,
      summary: outcome.summary,
    };
  });

  return {
    entity,
    columns,
    totalRows: rows.length,
    createCount: results.filter((r) => r.action === 'CREATE').length,
    updateCount: results.filter((r) => r.action === 'UPDATE').length,
    errorCount: results.filter((r) => r.action === 'ERROR').length,
    rows: results,
  };
}

/**
 * Re-validates from scratch and applies only the rows that pass, so a client
 * cannot submit data the preview never approved. Invalid rows are skipped
 * rather than failing the whole file.
 */
export async function commit(
  entity: ImportEntity,
  rows: ImportRow[],
  actorId: string,
): Promise<ImportCommitResult> {
  if (rows.length > IMPORT_MAX_ROWS) {
    throw ApiException.badRequest(`Import at most ${IMPORT_MAX_ROWS} rows at a time`);
  }

  const ctx = await buildImportContext();
  const handler = HANDLERS[entity];

  const valid: unknown[] = [];
  let skipped = 0;
  rows.forEach((row, index) => {
    const outcome = handler.parseRow(row, ctx, index + 1);
    if (outcome.issues.length > 0 || outcome.value === undefined) skipped++;
    else valid.push(outcome.value);
  });

  if (valid.length === 0) throw ApiException.badRequest('No valid rows to import');

  const { created, updated } = await handler.apply(valid, actorId);

  // Partner and lead imports move districts between coverage states (SPEC 7).
  await recomputeAllCoverage(prisma);

  await writeAuditLog({
    userId: actorId,
    action: 'CREATE',
    entity: 'Import',
    entityId: entity,
    after: { entity, created, updated, skipped },
  });

  return { entity, created, updated, skipped };
}

/** Header row plus one example row, so the owner can see the expected format. */
export function template(entity: ImportEntity): string {
  const columns = IMPORT_COLUMNS[entity];
  return toCsv(
    columns.map((c) => c.key),
    [columns.map((c) => c.example)],
  );
}
