'use client';

import Link from 'next/link';
import { MessageCircle, Phone } from 'lucide-react';
import type { LeadSummaryCard, PartnerSummaryCard, TownCoverage } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError } from '@/lib/api-client';
import { formatDate, formatINR, formatNumber, formatPhone, telHref, whatsAppHref } from '@/lib/format';
import { useDistrictSummary, type PeriodRange } from '@/features/geo/api';
import { COVERAGE_STYLES } from './map-config';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">({count})</span>
      </h3>
      {children}
    </section>
  );
}

/** Tap-to-call and WhatsApp, because the owner works this list from a phone. */
function ContactLinks({ phone }: { phone: string }) {
  return (
    <span className="flex items-center gap-3">
      <a
        href={telHref(phone)}
        className="inline-flex items-center gap-1 font-medium text-primary underline"
      >
        <Phone className="h-3 w-3" />
        {formatPhone(phone)}
      </a>
      <a
        href={whatsAppHref(phone)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-medium text-primary underline"
        aria-label={`WhatsApp ${formatPhone(phone)}`}
      >
        <MessageCircle className="h-3 w-3" />
      </a>
    </span>
  );
}

function PartnerCard({ partner }: { partner: PartnerSummaryCard }) {
  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{partner.firmName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {partner.ownerName} &middot; {partner.townName}
          </p>
        </div>
        <Badge variant={partner.status === 'ACTIVE' ? 'success' : 'secondary'}>
          {partner.status}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{partner.address}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <ContactLinks phone={partner.phone} />
        <span className="text-muted-foreground">
          Last order {partner.lastOrderAt ? formatDate(partner.lastOrderAt) : 'never'}
        </span>
      </div>
    </li>
  );
}

function LeadCard({ lead }: { lead: LeadSummaryCard }) {
  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{lead.firmName ?? lead.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {lead.firmName ? `${lead.name} · ` : ''}
            {lead.townName}
          </p>
        </div>
        <Badge variant="outline">{lead.stage.replace(/_/g, ' ')}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <ContactLinks phone={lead.phone} />
        <span className="text-muted-foreground">
          {lead.followUpAt ? `Follow up ${formatDate(lead.followUpAt)}` : 'No follow-up set'}
        </span>
      </div>
      {lead.assignedToName ? (
        <p className="mt-1 text-xs text-muted-foreground">Assigned to {lead.assignedToName}</p>
      ) : null}
    </li>
  );
}

function TownRow({ town }: { town: TownCoverage }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{town.name}</p>
        <p className="text-xs text-muted-foreground">
          {town.type} &middot; {town.retailers} shops &middot; {town.openLeads} leads
        </p>
      </div>
      <Badge variant={town.isCovered ? 'success' : 'secondary'}>
        {town.isCovered ? 'Covered' : 'Open'}
      </Badge>
    </li>
  );
}

export function DistrictPanel({
  districtId,
  period,
  onClose,
}: {
  districtId: string | null;
  period: PeriodRange;
  onClose: () => void;
}) {
  const { data, isPending, isError, error, refetch } = useDistrictSummary(districtId, period);

  return (
    <Sheet open={Boolean(districtId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{data?.name ?? 'District'}</SheetTitle>
          <SheetDescription>
            {data ? (
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${COVERAGE_STYLES[data.coverageStatus].swatch}`}
                >
                  {COVERAGE_STYLES[data.coverageStatus].label}
                </span>
                <span>
                  {data.nameGu} &middot; {data.zone.replace(/_/g, ' ')}
                </span>
              </span>
            ) : (
              'Loading district details'
            )}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {isPending ? <LoadingState /> : null}

          {isError ? (
            <ErrorState
              message={error instanceof ApiRequestError ? error.message : undefined}
              onRetry={() => void refetch()}
            />
          ) : null}

          {data ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Retailers" value={formatNumber(data.counts.retailers)} />
                <Stat
                  label="Towns covered"
                  value={`${data.counts.townsCovered} / ${data.counts.towns}`}
                />
                <Stat label="Orders this period" value={formatNumber(data.counts.ordersThisPeriod)} />
                <Stat label="Order value" value={formatINR(data.counts.orderValueThisPeriod)} />
              </div>

              <Section title="Super stockists" count={data.superStockists.length}>
                {data.superStockists.length ? (
                  <ul className="space-y-2">
                    {data.superStockists.map((p) => (
                      <PartnerCard key={p.id} partner={p} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">None appointed yet.</p>
                )}
              </Section>

              <Section title="Distributors" count={data.distributors.length}>
                {data.distributors.length ? (
                  <ul className="space-y-2">
                    {data.distributors.map((p) => (
                      <PartnerCard key={p.id} partner={p} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">None appointed yet.</p>
                )}
              </Section>

              <Section title="Open leads" count={data.openLeads.length}>
                {data.openLeads.length ? (
                  <ul className="space-y-2">
                    {data.openLeads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No open leads.</p>
                )}
              </Section>

              <Section title="Towns" count={data.towns.length}>
                {data.towns.length ? (
                  <ul className="space-y-2">
                    {data.towns.map((town) => (
                      <TownRow key={town.id} town={town} />
                    ))}
                  </ul>
                ) : (
                  <EmptyState message="No towns mapped in this district yet." />
                )}
              </Section>

              <Section title="Assigned salesmen" count={data.salesmen.length}>
                {data.salesmen.length ? (
                  <ul className="space-y-2">
                    {data.salesmen.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <span className="truncate font-medium">{s.name}</span>
                        <ContactLinks phone={s.phone} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No territory covers this district yet.
                  </p>
                )}
              </Section>

              <Link
                href={`/admin/partners?districtId=${data.id}`}
                className="inline-block text-sm font-medium text-primary underline"
              >
                View all partners in {data.name}
              </Link>
            </>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
