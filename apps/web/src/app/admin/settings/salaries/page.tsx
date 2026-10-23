'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Role } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatDate, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSalesmenOptions } from '@/features/leads/api';
import { useDeleteSalary, useSalaryStructures, useSaveSalary } from '@/features/payroll/api';

const firstOfMonth = () => `${new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 7)}-01`;

/** SPEC 4.8: salary structures. A revision applies from its date; the cost report uses the one in force at month end. */
export default function SalarySettingsPage() {
  const salaries = useSalaryStructures();
  const save = useSaveSalary();
  const remove = useDeleteSalary();
  const { data: users = [] } = useSalesmenOptions();
  const salesmen = users.filter((u) => u.role === Role.SALESMAN);

  const [salesmanId, setSalesmanId] = useState('');
  const [basic, setBasic] = useState('');
  const [hra, setHra] = useState('');
  const [fixed, setFixed] = useState('');
  const [from, setFrom] = useState(firstOfMonth);
  const total = Number(basic || 0) + Number(hra || 0) + Number(fixed || 0);

  const submit = async () => {
    try {
      await save.mutateAsync({
        salesmanId,
        basic: Number(basic || 0),
        hra: Number(hra || 0),
        fixedAllowance: Number(fixed || 0),
        effectiveFrom: from,
      });
      toast.success('Salary saved');
      setBasic('');
      setHra('');
      setFixed('');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not save the salary');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a salary revision</CardTitle>
          <CardDescription>
            Monthly amounts. Saving on a date that already has a revision replaces it. Final and
            paid reports keep the salary they were generated with.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Salesman</Label>
            <Select value={salesmanId} onValueChange={setSalesmanId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick salesman" />
              </SelectTrigger>
              <SelectContent>
                {salesmen.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-basic">Basic ₹</Label>
            <Input
              id="sal-basic"
              inputMode="decimal"
              value={basic}
              onChange={(e) => setBasic(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-hra">HRA ₹</Label>
            <Input
              id="sal-hra"
              inputMode="decimal"
              value={hra}
              onChange={(e) => setHra(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-fixed">Fixed allowance ₹</Label>
            <Input
              id="sal-fixed"
              inputMode="decimal"
              value={fixed}
              onChange={(e) => setFixed(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-from">Effective from</Label>
            <Input
              id="sal-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 lg:col-span-6">
            <Button
              onClick={() => void submit()}
              disabled={!salesmanId || total <= 0 || !from || save.isPending}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
            <span className="text-muted-foreground text-sm">Monthly total {formatINR(total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Salary history</CardTitle>
        </CardHeader>
        <CardContent>
          {salaries.isPending ? <LoadingState /> : null}
          {salaries.isError ? <ErrorState onRetry={() => void salaries.refetch()} /> : null}
          {salaries.data?.length === 0 ? <EmptyState message="No salaries set yet." /> : null}
          {salaries.data && salaries.data.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Salesman</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">HRA</TableHead>
                    <TableHead className="text-right">Fixed</TableHead>
                    <TableHead className="text-right">Monthly</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salaries.data.map((s) => (
                    <TableRow key={s.id} className={cn(!s.isCurrent && 'text-muted-foreground')}>
                      <TableCell className="font-medium">{s.salesman.name}</TableCell>
                      <TableCell>
                        {formatDate(s.effectiveFrom)}{' '}
                        {s.isCurrent ? <Badge variant="success">Current</Badge> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(s.basic)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(s.hra)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(s.fixedAllowance)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatINR(s.monthly)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete revision from ${formatDate(s.effectiveFrom)}`}
                          onClick={() =>
                            void remove
                              .mutateAsync(s.id)
                              .then(() => toast.success('Revision deleted'))
                              .catch((err) =>
                                toast.error(
                                  err instanceof ApiRequestError ? err.message : 'Could not delete',
                                ),
                              )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
