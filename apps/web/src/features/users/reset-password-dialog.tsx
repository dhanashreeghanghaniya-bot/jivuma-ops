'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { resetPasswordSchema, type UserListItem } from '@juma/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { useResetUserPassword } from './api';

type ResetForm = z.input<typeof resetPasswordSchema>;

export function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: UserListItem | null;
  onClose: () => void;
}) {
  const t = useT();
  const resetPassword = useResetUserPassword();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    if (!user) return;
    setFormError(null);
    try {
      await resetPassword.mutateAsync({ id: user.id, newPassword: values.newPassword });
      toast.success(`Password reset for ${user.name}. They have been signed out everywhere.`);
      reset();
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Could not reset the password');
    }
  });

  return (
    <Dialog
      open={Boolean(user)}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          setFormError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('users.resetPassword')}</DialogTitle>
          <DialogDescription>
            {user
              ? `${user.name} will be signed out of every device and must use the new password.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t('users.newPassword')}</Label>
            <Input id="newPassword" type="text" autoComplete="new-password" {...register('newPassword')} />
            {errors.newPassword ? (
              <p className="text-sm text-destructive">{errors.newPassword.message}</p>
            ) : null}
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('users.resetPassword')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
