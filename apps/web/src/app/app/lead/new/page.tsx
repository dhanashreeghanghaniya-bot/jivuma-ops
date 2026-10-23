'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { LeadType } from '@juma/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useCurrentDay, useFieldBootstrap } from '@/features/field/api';
import { getQuickFix } from '@/features/field/location';
import { enqueue, newUuid } from '@/features/field/offline/outbox';

const TYPES: LeadType[] = ['DISTRIBUTOR', 'SS', 'RETAILER'];

/** SPEC 5.1.4: a prospect spotted in the field, saved even without signal. */
export default function NewLeadPage() {
  const router = useRouter();
  const t = useT();
  const current = useCurrentDay();
  const bootstrap = useFieldBootstrap();

  const [clientUuid] = useState(newUuid);
  const [type, setType] = useState<LeadType>('DISTRIBUTOR');
  const [name, setName] = useState('');
  const [firmName, setFirmName] = useState('');
  const [phone, setPhone] = useState('');
  const [townId, setTownId] = useState('');
  const [investment, setInvestment] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (current.isPending || bootstrap.isPending) return <LoadingState />;
  if (!current.data?.day || current.data.isStale) {
    return (
      <EmptyState
        message={t('lead.needDay')}
        action={
          <Button asChild>
            <Link href="/app">{t('common.goToday')}</Link>
          </Button>
        }
      />
    );
  }
  const data = bootstrap.data;
  if (!data) return <EmptyState message={t('lead.noTerritory')} />;
  const districts = new Map(data.districts.map((d) => [d.id, d.name]));

  const save = async () => {
    if (name.trim().length < 2) return toast.error(t('lead.err.name'));
    if (!/^(\+91)?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, '')))
      return toast.error(t('common.validMobile'));
    if (!townId) return toast.error(t('visit.err.town'));
    setSaving(true);
    try {
      await enqueue({
        kind: 'lead',
        payload: {
          clientUuid,
          type,
          name: name.trim(),
          firmName: firmName.trim() || null,
          phone,
          townId,
          expectedInvestment: investment ? Number(investment) : null,
          followUpAt: followUpAt || null,
          notes: notes.trim() || null,
          // Best effort: a lead is worth saving even without a fix.
          location: await getQuickFix(),
        },
        summary: {
          name: firmName.trim() || name.trim(),
          townName: data.towns.find((town) => town.id === townId)?.name ?? '',
        },
      });
      toast.success(navigator.onLine ? t('lead.saved') : t('lead.savedOffline'));
      router.push('/app');
    } catch {
      toast.error(t('common.couldNotSave'));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link href="/app">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{t('lead.title')}</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label>{t('lead.prospectFor')}</Label>
            <div className="grid gap-2">
              {TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  aria-pressed={type === value}
                  className={cn(
                    'min-h-12 rounded-md border px-3 py-2 text-left',
                    type === value && 'border-primary bg-primary/10',
                  )}
                >
                  <span className="block text-sm font-medium">{t(`leadType.${value}`)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {t(`leadHint.${value}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-name">{t('lead.contact')}</Label>
            <Input
              id="lead-name"
              className="h-12"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-firm">{t('lead.firm')}</Label>
            <Input
              id="lead-firm"
              className="h-12"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-phone">{t('common.mobile')}</Label>
            <Input
              id="lead-phone"
              className="h-12"
              inputMode="tel"
              placeholder="98XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('common.town')}</Label>
            <Select value={townId} onValueChange={setTownId}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder={t('common.pickTown')} />
              </SelectTrigger>
              <SelectContent>
                {data.towns.map((town) => (
                  <SelectItem key={town.id} value={town.id}>
                    {town.name} · {districts.get(town.districtId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-inv">{t('lead.investment')}</Label>
              <Input
                id="lead-inv"
                className="h-12"
                inputMode="numeric"
                value={investment}
                onChange={(e) => setInvestment(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-follow">{t('lead.followUp')}</Label>
              <Input
                id="lead-follow"
                className="h-12"
                type="date"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-notes">{t('common.notes')}</Label>
            <textarea
              id="lead-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-base"
            />
          </div>
        </CardContent>
      </Card>

      <Button
        size="lg"
        className="h-14 w-full text-base"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {t('lead.save')}
      </Button>
    </div>
  );
}
