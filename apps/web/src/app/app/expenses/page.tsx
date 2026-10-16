import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SalesmanExpensesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Expenses</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claimed vs approved</CardTitle>
          <CardDescription>
            Auto-drafted TA/DA, bill photos and the monthly claim view arrive in Phase 6.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
