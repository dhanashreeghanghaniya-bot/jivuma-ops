'use client';

import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';

export default function TodayPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">{formatDate(new Date())}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start your day</CardTitle>
          <CardDescription>
            Location is mandatory. Visits, orders and leads unlock only after the day is started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="lg" className="w-full" disabled>
            <MapPin className="h-5 w-5" />
            Start Day
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            The day flow, GPS capture and offline queue arrive in Phase 4.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
