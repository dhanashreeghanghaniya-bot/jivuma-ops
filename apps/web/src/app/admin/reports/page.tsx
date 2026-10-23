'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CostReportTab } from '@/features/payroll/cost-report-tab';

const TABS = [{ key: 'cost', label: 'Monthly cost' }] as const;

export default function ReportsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('cost');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm">
          Field staff cost, sales, coverage and the lead funnel.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? 'default' : 'outline'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {tab === 'cost' ? <CostReportTab /> : null}
    </div>
  );
}
