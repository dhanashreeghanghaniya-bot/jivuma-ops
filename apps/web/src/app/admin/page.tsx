'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';

const KPIS = [
  { label: 'Districts covered', value: '3 / 33' },
  { label: 'Active distributors', value: '3' },
  { label: 'Active retailers', value: '13' },
  { label: 'Open leads', value: '6' },
];

export default function AdminDashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{user ? `, ${user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">
          Phase 1 is the foundation. The Gujarat coverage map lands in Phase 2.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription>{kpi.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">From seed data</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gujarat coverage map</CardTitle>
          <CardDescription>
            Phase 2 renders the district choropleth and partner markers here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-72 items-center justify-center rounded-md border border-dashed bg-muted/40 text-sm text-muted-foreground">
            Map placeholder
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
