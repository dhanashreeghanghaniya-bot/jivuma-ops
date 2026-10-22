'use client';

import Link from 'next/link';
import { ArrowLeft, MessageCircle, Navigation, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPhone, telHref, whatsAppHref } from '@/lib/format';

/** Google Maps deep link — no paid Directions API involved (SPEC 1). */
const navigateHref = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export function DetailHeader({
  title,
  subtitle,
  badges,
  actions,
}: {
  title: string;
  subtitle?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <Link
        href="/admin/partners"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All partners
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {badges}
          </div>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function ContactCard({
  phone,
  altPhone,
  email,
  address,
  townName,
  districtName,
  lat,
  lng,
}: {
  phone: string;
  altPhone?: string | null;
  email?: string | null;
  address: string;
  townName: string;
  districtName: string;
  lat: number | null;
  lng: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={telHref(phone)}>
              <Phone className="h-4 w-4" />
              {formatPhone(phone)}
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={whatsAppHref(phone)} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          </Button>
          {lat !== null && lng !== null ? (
            <Button asChild size="sm" variant="outline">
              <a href={navigateHref(lat, lng)} target="_blank" rel="noreferrer">
                <Navigation className="h-4 w-4" />
                Navigate
              </a>
            </Button>
          ) : null}
        </div>

        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {altPhone ? (
            <div>
              <dt className="text-xs text-muted-foreground">Alternate mobile</dt>
              <dd className="tabular-nums">{formatPhone(altPhone)}</dd>
            </div>
          ) : null}
          {email ? (
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="truncate">{email}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">Town</dt>
            <dd>
              {townName}, {districtName}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Address</dt>
            <dd>{address}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function TagList({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: string[];
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title} <span className="font-normal text-muted-foreground">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
              <Badge key={item} variant="secondary" className="font-normal">
                {item}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
