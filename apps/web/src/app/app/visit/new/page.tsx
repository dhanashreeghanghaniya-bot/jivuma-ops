'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  LocateFixed,
  Minus,
  Navigation,
  Plus,
  Search,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  GPS_ACCURACY_LIMIT_M,
  VISIT_DISTANCE_FLAG_M,
  type CreateVisitInput,
  type FieldBootstrap,
  type FieldRetailer,
  type GpsFix,
  type RetailerCategory,
  type VisitOutcome,
  type VisitPhotoType,
} from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState, LoadingState } from '@/components/data-states';
import { formatINR, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCurrentDay, useFieldBootstrap } from '@/features/field/api';
import { LocationHelp } from '@/features/field/components';
import {
  CATEGORY_LABELS,
  NO_ORDER_REASONS,
  OUTCOME_LABELS,
  PHOTO_TYPE_LABELS,
} from '@/features/field/labels';
import {
  distanceMeters,
  formatDistance,
  getFix,
  LocationError,
  navigateHref,
  type LocationFailure,
} from '@/features/field/location';
import { enqueue, newUuid } from '@/features/field/offline/outbox';
import { PhotoCapture, type CapturedPhoto } from '@/features/field/photo-input';

const PHOTO_SLOTS: VisitPhotoType[] = ['SHELF', 'DISPLAY', 'SHOP_FRONT', 'OTHER'];
const EXISTING_OUTCOMES: VisitOutcome[] = ['ORDER_TAKEN', 'NO_ORDER', 'SHOP_CLOSED', 'FOLLOW_UP'];
const NEW_SHOP_OUTCOMES: VisitOutcome[] = ['NEW_SHOP_ADDED', 'ORDER_TAKEN', 'FOLLOW_UP'];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 rounded-md border px-3 text-sm font-medium',
        active && 'border-primary bg-primary text-primary-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="flex h-10 w-10 items-center justify-center rounded-md border"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '') || 0))}
        className="h-10 w-12 rounded-md border text-center tabular-nums"
      />
      <button
        type="button"
        aria-label={`More ${label}`}
        onClick={() => onChange(value + 1)}
        className="flex h-10 w-10 items-center justify-center rounded-md border"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Auto check-in: GPS is taken as the screen opens and can be refreshed. */
function useCheckIn() {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [error, setError] = useState<LocationFailure | null>(null);
  const [locating, setLocating] = useState(false);

  const locate = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      setFix((await getFix()).fix);
    } catch (err) {
      setError(err instanceof LocationError ? err.reason : 'unavailable');
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void locate();
  }, [locate]);

  return { fix, error, locating, locate };
}

interface NewShopDraft {
  shopName: string;
  ownerName: string;
  phone: string;
  category: RetailerCategory;
  address: string;
  townId: string;
  distributorId: string;
}

const emptyShop: NewShopDraft = {
  shopName: '',
  ownerName: '',
  phone: '',
  category: 'KIRANA',
  address: '',
  townId: '',
  distributorId: '',
};

function VisitForm({ bootstrap, workDayId }: { bootstrap: FieldBootstrap; workDayId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const checkIn = useCheckIn();

  const [clientUuid] = useState(newUuid);
  const [retailerId, setRetailerId] = useState<string | null>(params.get('retailerId'));
  const [addingShop, setAddingShop] = useState(false);
  const [shop, setShop] = useState<NewShopDraft>(emptyShop);
  const [search, setSearch] = useState('');
  const [townFilter, setTownFilter] = useState('ALL');

  const [outcome, setOutcome] = useState<VisitOutcome | null>(null);
  const [noOrderReason, setNoOrderReason] = useState('');
  const [distributorId, setDistributorId] = useState('');
  const [qty, setQty] = useState<Record<string, { cases: number; units: number }>>({});
  const [photos, setPhotos] = useState<Partial<Record<VisitPhotoType, CapturedPhoto>>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const towns = useMemo(() => new Map(bootstrap.towns.map((t) => [t.id, t])), [bootstrap]);
  const districts = useMemo(() => new Map(bootstrap.districts.map((d) => [d.id, d])), [bootstrap]);
  const retailer = bootstrap.retailers.find((r) => r.id === retailerId) ?? null;

  // Nearest shops first once we know where the salesman is (SPEC 5.1.3).
  const shopList = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bootstrap.retailers
      .filter((r) => townFilter === 'ALL' || r.townId === townFilter)
      .filter(
        (r) =>
          !term ||
          r.shopName.toLowerCase().includes(term) ||
          r.ownerName.toLowerCase().includes(term) ||
          r.phone.includes(term),
      )
      .map((r) => ({ r, d: checkIn.fix ? distanceMeters(checkIn.fix, r) : null }))
      .sort((a, b) => (a.d ?? 0) - (b.d ?? 0) || a.r.shopName.localeCompare(b.r.shopName));
  }, [bootstrap, search, townFilter, checkIn.fix]);

  const shopTownId = retailer?.townId ?? shop.townId;
  const servingDistributors = useMemo(() => {
    const serves = (d: FieldBootstrap['distributors'][number]) =>
      d.townId === shopTownId || d.coveredTownIds.includes(shopTownId);
    return [...bootstrap.distributors].sort((a, b) => Number(serves(b)) - Number(serves(a)));
  }, [bootstrap, shopTownId]);

  // Default the delivering distributor to the shop's own.
  useEffect(() => {
    const preferred = retailer?.distributorId ?? shop.distributorId;
    if (preferred) setDistributorId(preferred);
  }, [retailer?.distributorId, shop.distributorId]);

  const lines = bootstrap.products
    .map((p) => {
      const q = qty[p.id] ?? { cases: 0, units: 0 };
      const units = q.cases * p.unitsPerCase + q.units;
      return { product: p, ...q, amount: units * Number(p.retailerPrice) };
    })
    .filter((l) => l.cases + l.units > 0);
  const orderTotal = lines.reduce((sum, l) => sum + l.amount, 0);

  const distanceToShop = retailer && checkIn.fix ? distanceMeters(checkIn.fix, retailer) : null;
  const outcomes = addingShop ? NEW_SHOP_OUTCOMES : EXISTING_OUTCOMES;

  const pickShop = (r: FieldRetailer) => {
    setRetailerId(r.id);
    setAddingShop(false);
    if (outcome === 'NEW_SHOP_ADDED') setOutcome(null);
  };

  const validate = (): string | null => {
    if (!checkIn.fix) return 'Waiting for your location';
    if (!retailer && !addingShop) return 'Pick a shop or add a new one';
    if (addingShop) {
      if (shop.shopName.trim().length < 2) return 'Enter the shop name';
      if (shop.ownerName.trim().length < 2) return "Enter the owner's name";
      if (!/^(\+91)?[6-9]\d{9}$/.test(shop.phone.replace(/[\s-]/g, '')))
        return 'Enter a valid 10-digit mobile';
      if (!shop.townId) return 'Pick the town';
      if (shop.address.trim().length < 3) return 'Enter the address';
      if (!shop.distributorId) return 'Pick the distributor who will supply this shop';
    }
    if (!outcome) return 'Pick an outcome';
    if (outcome === 'NO_ORDER' && !noOrderReason) return 'Say why there was no order';
    if (outcome === 'ORDER_TAKEN') {
      if (!distributorId) return 'Pick the distributor who will deliver';
      if (lines.length === 0) return 'Add at least one product';
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) return toast.error(problem);
    const fix = checkIn.fix!;
    setSaving(true);

    const townId = retailer?.townId ?? shop.townId;
    const payload: CreateVisitInput = {
      clientUuid,
      workDayId,
      retailerId: retailer?.id ?? null,
      newShop: addingShop
        ? {
            shopName: shop.shopName.trim(),
            ownerName: shop.ownerName.trim(),
            phone: shop.phone,
            category: shop.category,
            address: shop.address.trim(),
            // The shop is where the salesman is standing when he adds it.
            lat: fix.lat,
            lng: fix.lng,
            distributorId: shop.distributorId,
            photoPath: null,
          }
        : null,
      townId,
      checkIn: fix,
      outcome: outcome!,
      noOrderReason: outcome === 'NO_ORDER' ? noOrderReason : null,
      notes: notes.trim() || null,
      order:
        outcome === 'ORDER_TAKEN'
          ? {
              distributorId,
              items: lines.map((l) => ({
                productId: l.product.id,
                qtyCases: l.cases,
                qtyUnits: l.units,
              })),
            }
          : null,
    };

    try {
      await enqueue({
        kind: 'visit',
        payload,
        summary: {
          shopName: retailer?.shopName ?? shop.shopName.trim(),
          townName: towns.get(townId)?.name ?? '',
          orderTotal: outcome === 'ORDER_TAKEN' ? orderTotal.toFixed(2) : null,
        },
        photos: PHOTO_SLOTS.flatMap((type, index) => {
          const photo = photos[type];
          return photo
            ? [
                {
                  key: `${clientUuid}-${index + 1}`,
                  blob: photo.blob,
                  type,
                  capturedAt: photo.capturedAt,
                  lat: fix.lat,
                  lng: fix.lng,
                },
              ]
            : [];
        }),
      });
      toast.success(
        navigator.onLine
          ? 'Visit saved'
          : 'Visit saved on this phone. It will sync when you are online.',
      );
      router.push('/app');
    } catch {
      toast.error('Could not save on this phone. Is storage full?');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/app">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">New visit</h1>
      </div>

      {/* Check-in */}
      {checkIn.error ? (
        <LocationHelp
          reason={checkIn.error}
          onRetry={() => void checkIn.locate()}
          busy={checkIn.locating}
        />
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="flex items-center gap-2">
            {checkIn.locating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4 text-emerald-600" />
            )}
            {checkIn.fix ? (
              <span>
                Checked in ±{checkIn.fix.accuracyM} m
                {checkIn.fix.accuracyM > GPS_ACCURACY_LIMIT_M ? (
                  <span className="text-amber-700"> (weak)</span>
                ) : null}
              </span>
            ) : (
              'Getting your location...'
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void checkIn.locate()}
            disabled={checkIn.locating}
          >
            Refresh
          </Button>
        </div>
      )}

      {/* Shop */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Shop</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {retailer && !addingShop ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{retailer.shopName}</p>
                  <p className="text-muted-foreground text-sm">
                    {retailer.ownerName} · {formatPhone(retailer.phone)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {towns.get(retailer.townId)?.name}
                  </p>
                </div>
                <a
                  href={navigateHref(retailer.lat, retailer.lng)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Navigate"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"
                >
                  <Navigation className="h-4 w-4" />
                </a>
              </div>
              {distanceToShop !== null ? (
                <p
                  className={cn(
                    'text-xs',
                    distanceToShop > VISIT_DISTANCE_FLAG_M
                      ? 'font-medium text-amber-700'
                      : 'text-muted-foreground',
                  )}
                >
                  You are {formatDistance(distanceToShop)} from this shop&apos;s saved location
                  {distanceToShop > VISIT_DISTANCE_FLAG_M ? '. The admin will see this.' : '.'}
                </p>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => setRetailerId(null)}>
                Change shop
              </Button>
            </div>
          ) : null}

          {!retailer && !addingShop ? (
            <>
              <div className="relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search shop, owner or phone"
                  className="h-12 pl-9 text-base"
                />
              </div>
              <Select value={townFilter} onValueChange={setTownFilter}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All towns</SelectItem>
                  {bootstrap.towns.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {districts.get(t.districtId)?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {shopList.length === 0 ? <EmptyState message="No shops match." /> : null}
                {shopList.map(({ r, d }) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pickShop(r)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.shopName}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {r.ownerName} · {towns.get(r.townId)?.name}
                        {r.isVerified ? '' : ' · unverified'}
                      </span>
                    </span>
                    {d !== null ? (
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {formatDistance(d)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              <Button variant="outline" className="h-12 w-full" onClick={() => setAddingShop(true)}>
                <Store className="h-4 w-4" />
                Add new shop
              </Button>
            </>
          ) : null}

          {addingShop ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="shop-name">Shop name</Label>
                <Input
                  id="shop-name"
                  className="h-12"
                  value={shop.shopName}
                  onChange={(e) => setShop({ ...shop, shopName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shop-owner">Owner</Label>
                <Input
                  id="shop-owner"
                  className="h-12"
                  value={shop.ownerName}
                  onChange={(e) => setShop({ ...shop, ownerName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shop-phone">Mobile</Label>
                <Input
                  id="shop-phone"
                  className="h-12"
                  inputMode="tel"
                  placeholder="98XXXXXXXX"
                  value={shop.phone}
                  onChange={(e) => setShop({ ...shop, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(CATEGORY_LABELS) as RetailerCategory[]).map((c) => (
                    <Chip
                      key={c}
                      active={shop.category === c}
                      onClick={() => setShop({ ...shop, category: c })}
                    >
                      {CATEGORY_LABELS[c]}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Town</Label>
                <Select
                  value={shop.townId}
                  onValueChange={(townId) => setShop({ ...shop, townId })}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Pick town" />
                  </SelectTrigger>
                  <SelectContent>
                    {bootstrap.towns.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} · {districts.get(t.districtId)?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shop-address">Address</Label>
                <Input
                  id="shop-address"
                  className="h-12"
                  value={shop.address}
                  onChange={(e) => setShop({ ...shop, address: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Supplied by</Label>
                <Select
                  value={shop.distributorId}
                  onValueChange={(id) => setShop({ ...shop, distributorId: id })}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Pick distributor" />
                  </SelectTrigger>
                  <SelectContent>
                    {servingDistributors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.firmName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
                The shop is pinned at your current GPS position
                {checkIn.fix ? ` (±${checkIn.fix.accuracyM} m)` : ''}. Stand at the shop when you
                save. The admin verifies new shops before they count as active.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAddingShop(false);
                  setShop(emptyShop);
                  if (outcome === 'NEW_SHOP_ADDED') setOutcome(null);
                }}
              >
                Pick an existing shop instead
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Outcome */}
      {retailer || addingShop ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Outcome</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {outcomes.map((o) => (
                <Chip key={o} active={outcome === o} onClick={() => setOutcome(o)}>
                  {OUTCOME_LABELS[o]}
                </Chip>
              ))}
            </div>
            {outcome === 'NO_ORDER' ? (
              <div className="flex flex-wrap gap-2">
                {NO_ORDER_REASONS.map((reason) => (
                  <Chip
                    key={reason}
                    active={noOrderReason === reason}
                    onClick={() => setNoOrderReason(reason)}
                  >
                    {reason}
                  </Chip>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Order */}
      {outcome === 'ORDER_TAKEN' ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Delivered by</Label>
              <Select value={distributorId} onValueChange={setDistributorId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Pick distributor" />
                </SelectTrigger>
                <SelectContent>
                  {servingDistributors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.firmName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {bootstrap.products.map((p) => {
              const q = qty[p.id] ?? { cases: 0, units: 0 };
              const set = (next: Partial<typeof q>) =>
                setQty({ ...qty, [p.id]: { ...q, ...next } });
              return (
                <div key={p.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {p.packSize} · {p.unitsPerCase}/case · {formatINR(p.retailerPrice, true)}
                        /unit
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      Cases{' '}
                      <Stepper
                        label={`cases of ${p.name}`}
                        value={q.cases}
                        onChange={(cases) => set({ cases })}
                      />
                    </div>
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      Units{' '}
                      <Stepper
                        label={`units of ${p.name}`}
                        value={q.units}
                        onChange={(units) => set({ units })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="bg-muted flex items-center justify-between rounded-md px-3 py-3">
              <span className="text-sm">
                Total · {lines.length} product{lines.length === 1 ? '' : 's'}
              </span>
              <span className="text-lg font-semibold tabular-nums">{formatINR(orderTotal)}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Photos + notes */}
      {retailer || addingShop ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Photos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {PHOTO_SLOTS.map((type) => (
                <PhotoCapture
                  key={type}
                  label={PHOTO_TYPE_LABELS[type]}
                  fix={checkIn.fix}
                  photo={photos[type] ?? null}
                  onChange={(photo) => setPhotos({ ...photos, [type]: photo ?? undefined })}
                />
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-base"
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Button
        size="lg"
        className="h-14 w-full text-base"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        Save visit
      </Button>
    </div>
  );
}

function NewVisitContent() {
  const current = useCurrentDay();
  const bootstrap = useFieldBootstrap();

  if (current.isPending || bootstrap.isPending) return <LoadingState />;
  const day = current.data?.day;
  if (!day || current.data?.isStale) {
    return (
      <EmptyState
        message="Start your day first. Visits unlock once the day has started."
        action={
          <Button asChild>
            <Link href="/app">Go to Today</Link>
          </Button>
        }
      />
    );
  }
  if (!bootstrap.data)
    return (
      <EmptyState message="Your shop list is not on this phone yet. Connect once to load it." />
    );
  return <VisitForm bootstrap={bootstrap.data} workDayId={day.id} />;
}

export default function NewVisitPage() {
  // `useSearchParams` needs a Suspense boundary to keep the route statically shell-rendered.
  return (
    <Suspense fallback={<LoadingState />}>
      <NewVisitContent />
    </Suspense>
  );
}
