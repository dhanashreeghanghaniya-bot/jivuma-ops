'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Role, createUserSchema, type UserListItem } from '@juma/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiRequestError } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { useCreateUser, useTowns } from './api';

type CreateUserForm = z.input<typeof createUserSchema>;

const NONE = '__none__';

export function CreateUserDialog({ existingUsers }: { existingUsers: UserListItem[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data: towns = [], isLoading: townsLoading } = useTowns();
  const createUser = useCreateUser();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      role: Role.SALESMAN,
      joiningDate: new Date().toISOString().slice(0, 10),
      hqTownId: null,
      reportingToId: null,
    },
  });

  const managers = existingUsers.filter((u) => u.role !== Role.SALESMAN && u.isActive);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createUser.mutateAsync(createUserSchema.parse(values));
      toast.success(`${values.name} can now sign in`);
      reset();
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        for (const [path, message] of Object.entries(err.fieldErrors)) {
          setError(path as keyof CreateUserForm, { message });
        }
        toast.error(err.message);
      } else {
        toast.error('Could not create the user');
      }
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" />
          {t('users.add')}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.add')}</DialogTitle>
          <DialogDescription>
            The mobile number is the login id. Share the password with them directly.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t('users.name')}</Label>
              <Input id="name" autoComplete="off" {...register('name')} />
              {errors.name ? (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('auth.mobile')}</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder={t('auth.mobilePlaceholder')}
                autoComplete="off"
                {...register('phone')}
              />
              {errors.phone ? (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="text" autoComplete="new-password" {...register('password')} />
              {errors.password ? (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="joiningDate">{t('users.joined')}</Label>
              <Input id="joiningDate" type="date" {...register('joiningDate')} />
              {errors.joiningDate ? (
                <p className="text-sm text-destructive">{errors.joiningDate.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>{t('users.role')}</Label>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value ?? Role.SALESMAN} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={Role.SALESMAN}>Salesman</SelectItem>
                      <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('users.hq')}</Label>
              <Controller
                control={control}
                name="hqTownId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    disabled={townsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={townsLoading ? t('common.loading') : t('common.none')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('common.none')}</SelectItem>
                      {towns.map((town) => (
                        <SelectItem key={town.id} value={town.id}>
                          {town.name} ({town.district.name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>{t('users.reportsTo')}</Label>
              <Controller
                control={control}
                name="reportingToId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('common.none')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('common.none')}</SelectItem>
                      {managers.map((manager) => (
                        <SelectItem key={manager.id} value={manager.id}>
                          {manager.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
