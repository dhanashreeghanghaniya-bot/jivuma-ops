'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { changePasswordSchema } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestError, api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatPhone } from '@/lib/format';
import { useT } from '@/lib/i18n';

type ChangePasswordForm = z.input<typeof changePasswordSchema>;

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post('/auth/change-password', values);
      toast.success('Password changed. Please sign in again.');
      reset();
      // Changing the password revokes every session, this one included.
      await logout();
    } catch (err) {
      setFormError(
        err instanceof ApiRequestError ? err.message : 'Could not change the password',
      );
    }
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{t('nav.profile')}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{user?.name}</CardTitle>
          <CardDescription>{formatPhone(user?.phone)}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>You will be signed out of every device.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input id="currentPassword" type="password" {...register('currentPassword')} />
              {errors.currentPassword ? (
                <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input id="newPassword" type="password" {...register('newPassword')} />
              {errors.newPassword ? (
                <p className="text-sm text-destructive">{errors.newPassword.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
              {errors.confirmPassword ? (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              ) : null}
            </div>

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full" onClick={() => void logout()}>
        <LogOut className="h-4 w-4" />
        {t('auth.signOut')}
      </Button>
    </div>
  );
}
