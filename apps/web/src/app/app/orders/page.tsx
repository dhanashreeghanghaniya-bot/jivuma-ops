import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SalesmanOrdersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders you have taken</CardTitle>
          <CardDescription>
            Order taking with the product picker arrives in Phase 4; full status tracking in Phase 5.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
