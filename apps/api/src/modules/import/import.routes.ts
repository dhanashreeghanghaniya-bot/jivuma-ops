import express, { Router, type Request } from 'express';
import {
  IMPORT_COLUMNS,
  importCommitSchema,
  importEntityParamsSchema,
  type ImportCommitInput,
  type ImportEntity,
  type ImportRow,
} from '@juma/shared';
import { ApiException, sendOk } from '../../lib/http';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { params, validateParams } from '../../middleware/validate';
import { parseCsv } from './import.parse';
import * as service from './import.service';

export const importRouter = Router();

// Bulk import rewrites master data, so it is admin-only throughout (SPEC 6).
importRouter.use(requireAuth, requireAdmin);

/** 8 MB covers ~5,000 partner rows with room to spare. */
const csvBody = express.text({ type: ['text/csv', 'text/plain'], limit: '8mb' });

const entityOf = (req: Request): ImportEntity => params(req, importEntityParamsSchema).entity;

/**
 * Rows arrive either as raw CSV text (what a file upload posts) or as a JSON
 * `rows` array, which is what the preview hands back for the commit step.
 */
function rowsFromRequest(req: Request): ImportRow[] {
  if (typeof req.body === 'string') {
    if (!req.body.trim()) throw ApiException.badRequest('The file is empty');
    return parseCsv(req.body);
  }

  const parsed = importCommitSchema.safeParse(req.body);
  if (!parsed.success) throw ApiException.badRequest('Send either CSV text or a JSON `rows` array');
  return (parsed.data as ImportCommitInput).rows;
}

importRouter.get('/:entity/template.csv', validateParams(importEntityParamsSchema), (req, res) => {
  const entity = entityOf(req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="juma-${entity}-template.csv"`);
  return res.send(service.template(entity));
});

importRouter.get('/:entity/columns', validateParams(importEntityParamsSchema), (req, res) =>
  sendOk(res, IMPORT_COLUMNS[entityOf(req)]),
);

importRouter.post(
  '/:entity/preview',
  validateParams(importEntityParamsSchema),
  csvBody,
  async (req, res, next) => {
    try {
      return sendOk(res, await service.preview(entityOf(req), rowsFromRequest(req)));
    } catch (err) {
      next(err);
    }
  },
);

importRouter.post(
  '/:entity/commit',
  validateParams(importEntityParamsSchema),
  csvBody,
  async (req, res, next) => {
    try {
      return sendOk(res, await service.commit(entityOf(req), rowsFromRequest(req), req.auth!.userId));
    } catch (err) {
      next(err);
    }
  },
);
