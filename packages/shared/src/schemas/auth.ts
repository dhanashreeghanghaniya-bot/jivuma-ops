import { z } from 'zod';
import { phoneSchema, passwordSchema } from './common';
import { Role } from '../enums';

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  isActive: boolean;
  photoUrl: string | null;
  hqTownId: string | null;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

/** Shape of the signed JWT access token payload. */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
}
