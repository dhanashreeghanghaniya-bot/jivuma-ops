'use client';

import { useMemo, useState } from 'react';
import { KeyRound, MoreHorizontal, Power, PowerOff, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Role, type UserListItem } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatPhone } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSetUserActive, useUsers, type UsersFilters } from '@/features/users/api';
import { CreateUserDialog } from '@/features/users/create-user-dialog';
import { ResetPasswordDialog } from '@/features/users/reset-password-dialog';

export default function UsersSettingsPage() {
  const t = useT();
  const { user: currentUser } = useAuth();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UsersFilters['role']>('ALL');
  const [isActive, setIsActive] = useState<UsersFilters['isActive']>('ALL');
  const [page, setPage] = useState(1);
  const [resetTarget, setResetTarget] = useState<UserListItem | null>(null);

  const filters = useMemo<UsersFilters>(
    () => ({ page, search: search.trim() || undefined, role, isActive }),
    [page, search, role, isActive],
  );

  const { data, isPending, isError, error, refetch } = useUsers(filters);
  const setUserActive = useSetUserActive();

  const users = data?.items ?? [];
  const totalPages = Number(data?.meta?.totalPages ?? 1);

  const toggleActive = async (user: UserListItem) => {
    try {
      await setUserActive.mutateAsync({ id: user.id, isActive: !user.isActive });
      toast.success(user.isActive ? `${user.name} deactivated` : `${user.name} activated`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not update the user');
    }
  };

  const resetToFirstPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">{t('users.title')}</CardTitle>
          <CardDescription>{t('users.subtitle')}</CardDescription>
        </div>
        <CreateUserDialog existingUsers={users} />
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => resetToFirstPage(setSearch)(e.target.value)}
              placeholder={t('users.search')}
              className="pl-9"
            />
          </div>

          <Select value={role} onValueChange={resetToFirstPage(setRole) as (v: string) => void}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('common.all')} roles</SelectItem>
              <SelectItem value={Role.ADMIN}>Admin</SelectItem>
              <SelectItem value={Role.SALESMAN}>Salesman</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={isActive}
            onValueChange={resetToFirstPage(setIsActive) as (v: string) => void}
          >
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('common.all')}</SelectItem>
              <SelectItem value="true">{t('users.active')}</SelectItem>
              <SelectItem value="false">{t('users.inactive')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isPending ? <LoadingState /> : null}

        {isError ? (
          <ErrorState
            message={error instanceof ApiRequestError ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        ) : null}

        {!isPending && !isError && users.length === 0 ? (
          <EmptyState message={t('users.empty')} />
        ) : null}

        {!isPending && !isError && users.length > 0 ? (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('users.name')}</TableHead>
                    <TableHead>{t('auth.mobile')}</TableHead>
                    <TableHead>{t('users.role')}</TableHead>
                    <TableHead>{t('users.hq')}</TableHead>
                    <TableHead>{t('users.joined')}</TableHead>
                    <TableHead>{t('users.status')}</TableHead>
                    <TableHead className="w-16 text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <p className="font-medium">{user.name}</p>
                        {user.reportingTo ? (
                          <p className="text-xs text-muted-foreground">
                            {t('users.reportsTo')} {user.reportingTo.name}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatPhone(user.phone)}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === Role.ADMIN ? 'default' : 'secondary'}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.hqTown?.name ?? '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(user.joiningDate)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? 'success' : 'destructive'}>
                          {user.isActive ? t('users.active') : t('users.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">{t('common.actions')}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setResetTarget(user)}>
                              <KeyRound className="h-4 w-4" />
                              {t('users.resetPassword')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              destructive={user.isActive}
                              disabled={user.id === currentUser?.id && user.isActive}
                              onSelect={() => void toggleActive(user)}
                            >
                              {user.isActive ? (
                                <PowerOff className="h-4 w-4" />
                              ) : (
                                <Power className="h-4 w-4" />
                              )}
                              {user.isActive ? t('users.deactivate') : t('users.activate')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {t('common.previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>

      <ResetPasswordDialog user={resetTarget} onClose={() => setResetTarget(null)} />
    </Card>
  );
}
