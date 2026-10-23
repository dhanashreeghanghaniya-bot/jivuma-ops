'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  ImportEntity,
  type ImportCommitResult,
  type ImportPreview,
  type ImportRowResult,
} from '@juma/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiRequestError } from '@/lib/api-client';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { downloadTemplate, useImportCommit, useImportPreview } from '@/features/import/api';

const ENTITY_LABELS: Record<ImportEntity, string> = {
  districts: 'Districts (update only)',
  towns: 'Towns',
  'super-stockists': 'Super stockists',
  distributors: 'Distributors',
  retailers: 'Retailers',
  leads: 'Leads',
};

const ENTITY_ORDER: ImportEntity[] = [
  'towns',
  'super-stockists',
  'distributors',
  'retailers',
  'leads',
  'districts',
];

function ActionBadge({ action }: { action: ImportRowResult['action'] }) {
  if (action === 'CREATE') return <Badge variant="success">New</Badge>;
  if (action === 'UPDATE') return <Badge variant="secondary">Update</Badge>;
  return <Badge variant="destructive">Error</Badge>;
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'neutral' | 'bad';
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-4 py-3',
        tone === 'good' && 'border-emerald-200 bg-emerald-50',
        tone === 'bad' && value > 0 && 'border-destructive/30 bg-destructive/5',
      )}
    >
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

export default function ImportSettingsPage() {
  const [entity, setEntity] = useState<ImportEntity>(ImportEntity.TOWNS);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const previewMutation = useImportPreview();
  const commitMutation = useImportCommit();

  const columns = IMPORT_COLUMNS[entity];

  const reset = () => {
    setFileName(null);
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const changeEntity = (next: ImportEntity) => {
    setEntity(next);
    reset();
  };

  const onFileChosen = async (chosen: File | undefined) => {
    if (!chosen) return;
    reset();
    setFileName(chosen.name);

    try {
      setFile(chosen);
      const data = await previewMutation.mutateAsync({ entity, file: chosen });
      setPreview(data);
    } catch (err) {
      setFile(null);
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not read the file');
    }
  };

  const commit = async () => {
    if (!file) return;
    try {
      const data = await commitMutation.mutateAsync({ entity, file });
      setResult(data);
      setPreview(null);
      toast.success(`${data.created} created, ${data.updated} updated`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'The import failed');
    }
  };

  const validRows = preview ? preview.createCount + preview.updateCount : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bulk import</CardTitle>
          <CardDescription>
            Upload an Excel (.xlsx) or CSV file to load geography, partners or leads in one go.
            Every row is validated before anything is written, and you choose whether to proceed. Up
            to {formatNumber(IMPORT_MAX_ROWS)} rows per file.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="entity">
                What are you importing?
              </label>
              <Select value={entity} onValueChange={(v) => changeEntity(v as ImportEntity)}>
                <SelectTrigger id="entity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_ORDER.map((item) => (
                    <SelectItem key={item} value={item}>
                      {ENTITY_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={() =>
                void downloadTemplate(entity).catch((err: unknown) =>
                  toast.error(
                    err instanceof ApiRequestError
                      ? err.message
                      : 'Could not download the template',
                  ),
                )
              }
            >
              <Download className="h-4 w-4" />
              Excel template
            </Button>

            <Button onClick={() => fileInput.current?.click()} disabled={previewMutation.isPending}>
              {previewMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {previewMutation.isPending ? 'Checking…' : 'Choose file'}
            </Button>

            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => void onFileChosen(e.target.files?.[0])}
            />
          </div>

          {fileName ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4" />
              {fileName}
            </p>
          ) : null}

          <details className="rounded-md border">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
              Columns for {ENTITY_LABELS[entity].toLowerCase()}
            </summary>
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Accepted values</TableHead>
                    <TableHead>Example</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columns.map((column) => (
                    <TableRow key={column.key}>
                      <TableCell className="font-mono text-xs">{column.key}</TableCell>
                      <TableCell>
                        {column.required ? (
                          <Badge variant="outline">Required</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Optional</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{column.hint}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {column.example || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Import finished
            </CardTitle>
            <CardDescription>Coverage has been recomputed across every district.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryTile label="Created" value={result.created} tone="good" />
              <SummaryTile label="Updated" value={result.updated} tone="neutral" />
              <SummaryTile label="Skipped" value={result.skipped} tone="bad" />
            </div>
            <Button variant="outline" onClick={reset}>
              Import another file
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {preview ? (
        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Check before importing</CardTitle>
              <CardDescription>
                {preview.errorCount > 0
                  ? `${formatNumber(preview.errorCount)} of ${formatNumber(preview.totalRows)} rows have problems. Importing will skip them and load the rest.`
                  : `All ${formatNumber(preview.totalRows)} rows look good.`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button
                onClick={() => void commit()}
                disabled={commitMutation.isPending || validRows === 0}
              >
                {commitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {commitMutation.isPending
                  ? 'Importing…'
                  : `Import ${formatNumber(validRows)} row${validRows === 1 ? '' : 's'}`}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryTile label="Will be created" value={preview.createCount} tone="good" />
              <SummaryTile label="Will be updated" value={preview.updateCount} tone="neutral" />
              <SummaryTile label="Will be skipped" value={preview.errorCount} tone="bad" />
            </div>

            {validRows === 0 ? (
              <p className="border-destructive/30 bg-destructive/5 flex items-start gap-2 rounded-md border px-4 py-3 text-sm">
                <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
                Nothing in this file can be imported. Fix the problems below and upload it again.
              </p>
            ) : null}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead className="w-24">Action</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Problems</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow
                      key={row.rowNumber}
                      className={cn(row.action === 'ERROR' && 'bg-destructive/5')}
                    >
                      <TableCell className="text-muted-foreground tabular-nums">
                        {row.rowNumber}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={row.action} />
                      </TableCell>
                      <TableCell className="text-sm">{row.summary}</TableCell>
                      <TableCell>
                        {row.issues.length === 0 ? (
                          <span className="text-muted-foreground text-xs">-</span>
                        ) : (
                          <ul className="text-destructive space-y-0.5 text-xs">
                            {row.issues.map((issue, index) => (
                              <li key={`${issue.column}-${index}`}>
                                <span className="font-mono">{issue.column}</span>: {issue.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
