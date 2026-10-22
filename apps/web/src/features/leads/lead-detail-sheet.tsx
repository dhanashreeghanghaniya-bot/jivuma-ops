'use client';

import { useState } from 'react';
import { ArrowRight, Loader2, MessageCircle, Pencil, Phone, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { LEAD_STAGE_ORDER, LeadStage, type LeadActivityType, type LeadDetail } from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ErrorState, LoadingState } from '@/components/data-states';
import { ApiRequestError } from '@/lib/api-client';
import {
  formatDate,
  formatDateTime,
  formatINR,
  formatPhone,
  telHref,
  whatsAppHref,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAddLeadActivity, useChangeLeadStage, useLead } from './api';
import {
  ACTIVITY_LABELS,
  SOURCE_LABELS,
  STAGE_ACCENTS,
  STAGE_LABELS,
  TYPE_LABELS,
} from './lead-labels';

function StageControl({ lead }: { lead: LeadDetail }) {
  const changeStage = useChangeLeadStage();
  const [lostReason, setLostReason] = useState('');
  const [askingReason, setAskingReason] = useState(false);

  const move = async (stage: LeadStage, reason?: string) => {
    try {
      await changeStage.mutateAsync({
        id: lead.id,
        input: { stage, lostReason: reason ?? null, note: null },
      });
      toast.success(`Moved to ${STAGE_LABELS[stage]}`);
      setAskingReason(false);
      setLostReason('');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not move the lead');
    }
  };

  if (lead.convertedAt) {
    return (
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Converted on {formatDate(lead.convertedAt)}. This lead is closed.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Stage</Label>
      <div className="flex flex-wrap gap-1.5">
        {LEAD_STAGE_ORDER.map((stage) => {
          const isCurrent = stage === lead.stage;
          return (
            <button
              key={stage}
              type="button"
              disabled={isCurrent || changeStage.isPending}
              aria-current={isCurrent}
              onClick={() => {
                if (stage === LeadStage.LOST) setAskingReason(true);
                else void move(stage);
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition disabled:cursor-default',
                isCurrent
                  ? 'border-foreground bg-foreground text-background'
                  : 'hover:bg-muted disabled:opacity-50',
              )}
            >
              {STAGE_LABELS[stage]}
            </button>
          );
        })}
      </div>

      {askingReason ? (
        <div className="space-y-2 rounded-md border p-3">
          <Label htmlFor="lost-reason">Why was it lost?</Label>
          <Input
            id="lost-reason"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="Went with a competitor"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!lostReason.trim() || changeStage.isPending}
              onClick={() => void move(LeadStage.LOST, lostReason.trim())}
            >
              Mark lost
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAskingReason(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActivityForm({ leadId }: { leadId: string }) {
  const addActivity = useAddLeadActivity();
  const [type, setType] = useState<LeadActivityType>('CALL');
  const [note, setNote] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');

  const submit = async () => {
    try {
      await addActivity.mutateAsync({
        id: leadId,
        input: {
          type: type as 'CALL' | 'VISIT' | 'NOTE',
          note: note.trim(),
          followUpAt: followUpAt || null,
        },
      });
      setNote('');
      setFollowUpAt('');
      toast.success('Logged');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not log the activity');
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex gap-2">
        <Select value={type} onValueChange={(v) => setType(v as LeadActivityType)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CALL">Call</SelectItem>
            <SelectItem value="VISIT">Visit</SelectItem>
            <SelectItem value="NOTE">Note</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened?"
          className="flex-1"
        />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="next-follow-up" className="text-muted-foreground text-xs">
            Move the follow-up to
          </Label>
          <Input
            id="next-follow-up"
            type="date"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
          />
        </div>
        <Button disabled={!note.trim() || addActivity.isPending} onClick={() => void submit()}>
          {addActivity.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Log
        </Button>
      </div>
    </div>
  );
}

export function LeadDetailSheet({
  leadId,
  onClose,
  onEdit,
  onConvert,
}: {
  leadId: string | null;
  onClose: () => void;
  onEdit: (lead: LeadDetail) => void;
  onConvert: (lead: LeadDetail) => void;
}) {
  const { data, isPending, isError, error, refetch } = useLead(leadId);

  return (
    <Sheet open={Boolean(leadId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined} className="sm:w-[30rem]">
        <SheetHeader>
          <SheetTitle>{data?.firmName ?? data?.name ?? 'Lead'}</SheetTitle>
          <SheetDescription>
            {data
              ? `${TYPE_LABELS[data.type]} · ${data.town.name}, ${data.district.name}`
              : 'Loading lead'}
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
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={telHref(data.phone)}>
                    <Phone className="h-4 w-4" />
                    {formatPhone(data.phone)}
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={whatsAppHref(data.phone)} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </a>
                </Button>
                <Button size="sm" variant="outline" onClick={() => onEdit(data)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                {data.stage === LeadStage.WON && !data.convertedAt ? (
                  <Button size="sm" onClick={() => onConvert(data)}>
                    <Sparkles className="h-4 w-4" />
                    Convert
                  </Button>
                ) : null}
              </div>

              <StageControl lead={data} />

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Contact</dt>
                  <dd>{data.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Source</dt>
                  <dd>{SOURCE_LABELS[data.source]}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Assigned to</dt>
                  <dd>{data.assignedTo?.name ?? 'Nobody'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Expected investment</dt>
                  <dd className="tabular-nums">
                    {data.expectedInvestment ? formatINR(data.expectedInvestment) : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Next follow-up</dt>
                  <dd
                    className={cn('tabular-nums', data.isOverdue && 'text-destructive font-medium')}
                  >
                    {data.followUpAt ? formatDate(data.followUpAt) : 'Not set'}
                    {data.isOverdue ? ' · overdue' : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Added</dt>
                  <dd>{formatDate(data.createdAt)}</dd>
                </div>
              </dl>

              {data.lostReason ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  Lost: {data.lostReason}
                </p>
              ) : null}

              {data.notes ? (
                <div>
                  <p className="text-muted-foreground text-xs">Notes</p>
                  <p className="whitespace-pre-wrap text-sm">{data.notes}</p>
                </div>
              ) : null}

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">
                  Timeline{' '}
                  <span className="text-muted-foreground font-normal">
                    ({data.activities.length})
                  </span>
                </h3>

                <ActivityForm leadId={data.id} />

                <ol className="space-y-3">
                  {data.activities.map((activity) => (
                    <li key={activity.id} className="flex gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          activity.type === 'STAGE_CHANGE'
                            ? STAGE_ACCENTS[data.stage]
                            : 'bg-muted-foreground',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-normal">
                            {ACTIVITY_LABELS[activity.type]}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            {formatDateTime(activity.at)} &middot; {activity.user.name}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm">{activity.note}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                {data.activities.length === 0 ? (
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    Nothing logged yet <ArrowRight className="h-3 w-3" /> use the box above.
                  </p>
                ) : null}
              </section>
            </>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
