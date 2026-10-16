'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { loginSchema } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestError } from '@/lib/api-client';
import { homePathForRole, useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';

// The shared schema normalises the phone to E.164; the form keeps raw input.
type LoginForm = z.input<typeof loginSchema>;

export default function LoginPage() {
  const { login, user, status } = useAuth();
  const router = useRouter();
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  // Someone who is already signed in should never see the login form.
  useEffect(() => {
    if (status === 'authenticated' && user) router.replace(homePathForRole(user.role));
  }, [status, user, router]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const signedIn = await login(values.phone, values.password);
      router.replace(homePathForRole(signedIn.role));
    } catch (err) {
      setFormError(
        err instanceof ApiRequestError ? err.message : 'Could not sign in. Please try again.',
      );
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('app.name')}</CardTitle>
          <CardDescription>{t('app.tagline')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('auth.mobile')}</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="username"
                placeholder={t('auth.mobilePlaceholder')}
                {...register('phone')}
              />
              {errors.phone ? (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password ? (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              ) : null}
            </div>

            {formError ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
