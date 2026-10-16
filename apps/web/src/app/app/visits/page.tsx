import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SalesmanVisitsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Visits</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visit history</CardTitle>
          <CardDescription>
            Shop visits with GPS check-in, photos and outcomes are built in Phase 4.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
