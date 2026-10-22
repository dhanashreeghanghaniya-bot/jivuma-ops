'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LeadType, type LeadDetail } from '@juma/shared';
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
import { LocationPicker } from '@/features/map/location-picker';
import { useDistributorOptions, useSuperStockistOptions } from '@/features/partners/api';
import { useTowns } from '@/features/users/api';
import { useConvertLead } from './api';
import { TYPE_LABELS } from './lead-labels';

const DETAIL_PATHS: Record<LeadType, string> = {
  SS: 'super-stockists',
  DISTRIBUTOR: 'distributors',
  RETAILER: 'retailers',
};

/**
 * One-click conversion of a WON lead (SPEC 2.2). The lead already carries the
 * contact details, so this only asks for what a partner needs and a lead does
 * not: an address, the parent partner, and a map pin for shops.
 */
export function ConvertLeadDialog({
  lead,
  onClose,
}: {
  lead: LeadDetail | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const convertLead = useConvertLead();
  const { data: superStockists = [] } = useSuperStockistOptions();
  const { data: distributors = [] } = useDistributorOptions();
  const { data: towns = [] } = useTowns();

  const [address, setAddress] = useState('');
  const [parentId, setParentId] = useState('');
  const [pin, setPin] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      setAddress('');
      setParentId('');
      setPin({ lat: null, lng: null });
      setError(null);
    }
  }, [lead]);

  if (!lead) return null;

  const needsSuperStockist = lead.type === LeadType.DISTRIBUTOR;
  const needsDistributor = lead.type === LeadType.RETAILER;
  const town = towns.find((t) => t.id === lead.town.id);

  const submit = async () => {
    setError(null);
    try {
      const result = await convertLead.mutateAsync({
        id: lead.id,
        input: {
          address,
          ...(needsSuperStockist ? { superStockistId: parentId } : {}),
          ...(needsDistributor ? { distributorId: parentId } : {}),
          lat: pin.lat,
          lng: pin.lng,
        },
      });
      toast.success(`${result.partnerName} created`);
      onClose();
      router.push(`/admin/partners/${DETAIL_PATHS[result.partnerType]}/${result.partnerId}`);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : 'Could not convert the lead';
      setError(message);
      toast.error(message);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convert to {TYPE_LABELS[lead.type].toLowerCase()}</DialogTitle>
          <DialogDescription>
            {lead.firmName ?? lead.name} in {lead.town.name} becomes a real partner. Contact details
            carry over from the lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="convert-address">Address</Label>
            <Input
              id="convert-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Shop 4, Market Road"
            />
          </div>

          {needsSuperStockist || needsDistributor ? (
            <div className="space-y-2">
              <Label>{needsSuperStockist ? 'Buys from' : 'Supplied by'}</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      needsSuperStockist ? 'Select a super stockist' : 'Select a distributor'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(needsSuperStockist ? superStockists : distributors).map((partner) => (
                    <SelectItem key={partner.id} value={partner.id}>
                      {partner.firmName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <LocationPicker
            value={pin}
            onChange={setPin}
            fallbackCenter={town ? { lat: town.lat, lng: town.lng } : undefined}
            error={
              needsDistributor && pin.lat === null ? 'A shop needs a pin on the map' : undefined
            }
          />

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={convertLead.isPending}>
            {convertLead.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {convertLead.isPending ? 'Converting…' : 'Create partner'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
