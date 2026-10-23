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
import { LanguageSwitch } from '@/lib/i18n/language-switch';
import { useOutbox, visibleItems } from '@/features/field/offline/outbox';
import { MyMonthCard } from '@/features/payroll/my-month';

type ChangePasswordForm = z.input<typeof changePasswordSchema>;

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const unsynced = visibleItems(useOutbox().items).length;

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
      toast.success(t('profile.passwordChanged'));
      reset();
      // Changing the password revokes every session, this one included.
      await logout();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : t('profile.passwordFailed'));
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
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{t('lang.label')}</CardTitle>
          <LanguageSwitch />
        </CardHeader>
      </Card>

      <MyMonthCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('profile.changePassword')}</CardTitle>
          <CardDescription>{t('profile.signedOutEverywhere')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t('profile.currentPassword')}</Label>
              <Input id="currentPassword" type="password" {...register('currentPassword')} />
              {errors.currentPassword ? (
                <p className="text-destructive text-sm">{errors.currentPassword.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('profile.newPassword')}</Label>
              <Input id="newPassword" type="password" {...register('newPassword')} />
              {errors.newPassword ? (
                <p className="text-destructive text-sm">{errors.newPassword.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('profile.confirmPassword')}</Label>
              <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
              {errors.confirmPassword ? (
                <p className="text-destructive text-sm">{errors.confirmPassword.message}</p>
              ) : null}
            </div>

            {formError ? <p className="text-destructive text-sm">{formError}</p> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {confirmLogout ? (
        <Card className="border-destructive/50">
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm">{t('profile.unsyncedWarning', { n: unsynced })}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setConfirmLogout(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={() => void logout()}>
                {t('profile.signOutAnyway')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => (unsynced > 0 ? setConfirmLogout(true) : void logout())}
        >
          <LogOut className="h-4 w-4" />
          {t('auth.signOut')}
        </Button>
      )}
    </div>
  );
}
