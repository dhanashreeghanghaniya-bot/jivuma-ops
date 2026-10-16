import { Construction } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Shell page for a screen that a later phase will fill in. */
export function PhasePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <Construction className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">{phase}</CardTitle>
            <CardDescription>
              The navigation and layout are in place; the screen itself is built in that phase.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
