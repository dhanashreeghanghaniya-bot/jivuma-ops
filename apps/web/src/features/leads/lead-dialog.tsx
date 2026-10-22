'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  LeadSource,
  LeadStage,
  LeadType,
  Role,
  createLeadSchema,
  type LeadDetail,
} from '@juma/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiRequestError } from '@/lib/api-client';
import { useTowns } from '@/features/users/api';
import { FieldError, TownSelect } from '@/features/partners/form-fields';
import { useSalesmenOptions, useSaveLead } from './api';
import { SOURCE_LABELS, STAGE_LABELS, TYPE_LABELS } from './lead-labels';

type FormValues = z.input<typeof createLeadSchema>;

const UNASSIGNED = '__none__';

const emptyValues: FormValues = {
  type: LeadType.DISTRIBUTOR,
  name: '',
  firmName: '',
  phone: '',
  townId: '',
  source: LeadSource.FIELD,
  stage: LeadStage.NEW,
  assignedToId: null,
  expectedInvestment: null,
  followUpAt: '',
  notes: '',
};

const toFormValues = (lead: LeadDetail): FormValues => ({
  type: lead.type,
  name: lead.name,
  firmName: lead.firmName ?? '',
  phone: lead.phone,
  townId: lead.town.id,
  source: lead.source,
  stage: lead.stage,
  assignedToId: lead.assignedTo?.id ?? null,
  expectedInvestment: lead.expectedInvestment === null ? null : Number(lead.expectedInvestment),
  // The input wants `YYYY-MM-DD`; the API returns an ISO timestamp.
  followUpAt: lead.followUpAt ? lead.followUpAt.slice(0, 10) : '',
  notes: lead.notes ?? '',
});

export function LeadDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: LeadDetail | null;
}) {
  const { data: towns = [], isLoading: townsLoading } = useTowns();
  const { data: users = [] } = useSalesmenOptions();
  const save = useSaveLead();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) reset(editing ? toFormValues(editing) : emptyValues);
  }, [open, editing, reset]);

  const salesmen = users.filter((u) => u.role === Role.SALESMAN);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const input = createLeadSchema.parse(values);
      await save.mutateAsync({ id: editing?.id, input });
      toast.success(editing ? `${input.name} updated` : `${input.name} added`);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        for (const [path, message] of Object.entries(err.fieldErrors)) {
          setError(path as keyof FormValues, { message });
        }
        toast.error(err.message);
      } else {
        toast.error('Could not save the lead');
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit lead' : 'Add lead'}</DialogTitle>
          <DialogDescription>
            A lead is a prospective partner for a place. Move it through the stages as you talk to
            them.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Becoming a</Label>
              <Select
                value={watch('type') ?? LeadType.DISTRIBUTOR}
                onValueChange={(value) => setValue('type', value as LeadType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as LeadType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Source</Label>
              <Select
                value={watch('source') ?? LeadSource.FIELD}
                onValueChange={(value) => setValue('source', value as LeadSource)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SOURCE_LABELS) as LeadSource[]).map((source) => (
                    <SelectItem key={source} value={source}>
                      {SOURCE_LABELS[source]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Contact name</Label>
              <Input id="name" autoComplete="off" {...register('name')} />
              <FieldError message={errors.name?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="firmName">Firm name</Label>
              <Input id="firmName" autoComplete="off" {...register('firmName')} />
              <FieldError message={errors.firmName?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Mobile</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder="98XXXXXXXX"
                {...register('phone')}
              />
              <FieldError message={errors.phone?.message} />
            </div>

            <TownSelect
              value={watch('townId')}
              onChange={(value) => setValue('townId', value, { shouldValidate: true })}
              towns={towns}
              loading={townsLoading}
              error={errors.townId?.message}
            />

            {editing ? null : (
              <div className="space-y-2">
                <Label>Stage</Label>
                <Select
                  value={watch('stage') ?? LeadStage.NEW}
                  onValueChange={(value) => setValue('stage', value as LeadStage)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Won and Lost are reached by moving the lead, not by typing. */}
                    {(
                      [
                        LeadStage.NEW,
                        LeadStage.CONTACTED,
                        LeadStage.MEETING_DONE,
                        LeadStage.NEGOTIATION,
                      ] as LeadStage[]
                    ).map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {STAGE_LABELS[stage]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Assigned to</Label>
              <Select
                value={watch('assignedToId') ?? UNASSIGNED}
                onValueChange={(value) =>
                  setValue('assignedToId', value === UNASSIGNED ? null : value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Nobody yet</SelectItem>
                  {salesmen.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedInvestment">Expected investment (₹)</Label>
              <Input
                id="expectedInvestment"
                inputMode="numeric"
                {...register('expectedInvestment')}
              />
              <FieldError message={errors.expectedInvestment?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="followUpAt">Next follow-up</Label>
              <Input id="followUpAt" type="date" {...register('followUpAt')} />
              <FieldError message={errors.followUpAt?.message} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                rows={3}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:text-sm"
                {...register('notes')}
              />
              <FieldError message={errors.notes?.message} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
