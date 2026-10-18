import type { NextFunction, Request, Response } from 'express';
import {
  listDistrictsQuerySchema,
  listTownsQuerySchema,
  type CreateTownInput,
  type UpdateDistrictInput,
  type UpdateTownInput,
} from '@juma/shared';
import { sendOk, sendPaginated } from '../../lib/http';
import { query } from '../../middleware/validate';
import * as service from './geo.service';

export async function districtsMap(req: Request, res: Response, next: NextFunction) {
  try {
    return sendOk(res, await service.getDistrictsMap(query(req, listDistrictsQuerySchema)));
  } catch (err) {
    next(err);
  }
}

export async function listDistricts(req: Request, res: Response, next: NextFunction) {
  try {
    const { zone, coverageStatus } = query(req, listDistrictsQuerySchema);
    return sendOk(res, await service.listDistricts({ zone, coverageStatus }));
  } catch (err) {
    next(err);
  }
}

export async function districtSummary(req: Request, res: Response, next: NextFunction) {
  try {
    return sendOk(res, await service.getDistrictSummary(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function updateDistrict(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as UpdateDistrictInput;
    return sendOk(res, await service.updateDistrict(req.params.id as string, input, req.auth!.userId));
  } catch (err) {
    next(err);
  }
}

export async function mapMarkers(_req: Request, res: Response, next: NextFunction) {
  try {
    return sendOk(res, await service.getMapMarkers());
  } catch (err) {
    next(err);
  }
}

export async function listTowns(req: Request, res: Response, next: NextFunction) {
  try {
    return sendPaginated(res, await service.listTowns(query(req, listTownsQuerySchema)));
  } catch (err) {
    next(err);
  }
}

export async function createTown(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as CreateTownInput;
    return sendOk(res, await service.createTown(input, req.auth!.userId), null, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateTown(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as UpdateTownInput;
    return sendOk(res, await service.updateTown(req.params.id as string, input, req.auth!.userId));
  } catch (err) {
    next(err);
  }
}

export async function deleteTown(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteTown(req.params.id as string, req.auth!.userId);
    return sendOk(res, { success: true });
  } catch (err) {
    next(err);
  }
}