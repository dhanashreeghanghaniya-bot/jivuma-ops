import type { NextFunction, Request, Response } from 'express';
import {
  listUsersQuerySchema,
  type CreateUserInput,
  type ResetPasswordInput,
  type UpdateUserInput,
} from '@juma/shared';
import { sendOk, sendPaginated } from '../../lib/http';
import { query } from '../../middleware/validate';
import * as usersService from './users.service';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.listUsers(query(req, listUsersQuerySchema));
    return sendPaginated(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    return sendOk(res, await usersService.getUser(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.createUser(req.body as CreateUserInput, req.auth!.userId);
    return sendOk(res, user, null, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.updateUser(
      req.params.id as string,
      req.body as UpdateUserInput,
      req.auth!.userId,
    );
    return sendOk(res, user);
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { newPassword } = req.body as ResetPasswordInput;
    await usersService.resetPassword(req.params.id as string, newPassword, req.auth!.userId);
    return sendOk(res, { success: true });
  } catch (err) {
    next(err);
  }
}

export async function deactivate(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.setActive(req.params.id as string, false, req.auth!.userId);
    return sendOk(res, user);
  } catch (err) {
    next(err);
  }
}

export async function activate(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.setActive(req.params.id as string, true, req.auth!.userId);
    return sendOk(res, user);
  } catch (err) {
    next(err);
  }
}
