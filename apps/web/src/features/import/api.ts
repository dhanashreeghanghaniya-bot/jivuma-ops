import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IMPORT_COLUMNS, type ImportCommitResult, type ImportEntity, type ImportPreview } from '@juma/shared';
import { apiRequest } from '@/lib/api-client';

/** The API's RFC 4180 parser is the single source of truth, so we post the file text as-is. */
const csvRequest = <T>(path: string, csv: string) =>
  apiRequest<T>(path, {
    method: 'POST',
    rawBody: csv,
    headers: { 'Content-Type': 'text/csv' },
  });

export function useImportPreview() {
  return useMutation({
    mutationFn: async ({ entity, csv }: { entity: ImportEntity; csv: string }) =>
      (await csvRequest<ImportPreview>(`/import/${entity}/preview`, csv)).data,
  });
}

export function useImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entity, csv }: { entity: ImportEntity; csv: string }) =>
      (await csvRequest<ImportCommitResult>(`/import/${entity}/commit`, csv)).data,
    onSuccess: () => {
      // An import can touch geography, partners, leads and therefore coverage.
      queryClient.invalidateQueries();
    },
  });
}

/**
 * Built in the browser from the shared column definitions rather than fetched.
 * The API's `template.csv` route sits behind auth, and the access token lives in
 * memory, so a plain download link could not carry it.
 */
export function downloadTemplate(entity: ImportEntity): void {
  const columns = IMPORT_COLUMNS[entity];
  const header = columns.map((c) => c.key).join(',');
  const example = columns
    .map((c) => (c.example.includes(',') ? `"${c.example}"` : c.example))
    .join(',');

  // The BOM makes Excel read the Gujarati examples correctly.
  const blob = new Blob([`\uFEFF${header}\r\n${example}\r\n`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `juma-${entity}-template.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
