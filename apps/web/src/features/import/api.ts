import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportCommitResult, ImportEntity, ImportPreview } from '@juma/shared';
import { apiRequest, downloadFile } from '@/lib/api-client';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const isExcelFile = (file: File) => /\.xlsx$/i.test(file.name) || file.type === XLSX_MIME;

/**
 * The API parses both formats, so the file is posted as-is: CSV as text,
 * Excel as bytes. The same file is posted again to commit.
 */
const fileRequest = <T>(path: string, file: File) =>
  apiRequest<T>(path, {
    method: 'POST',
    rawBody: file,
    headers: { 'Content-Type': isExcelFile(file) ? XLSX_MIME : 'text/csv' },
  });

export function useImportPreview() {
  return useMutation({
    mutationFn: async ({ entity, file }: { entity: ImportEntity; file: File }) =>
      (await fileRequest<ImportPreview>(`/import/${entity}/preview`, file)).data,
  });
}

export function useImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entity, file }: { entity: ImportEntity; file: File }) =>
      (await fileRequest<ImportCommitResult>(`/import/${entity}/commit`, file)).data,
    onSuccess: () => {
      // An import can touch geography, partners, leads and therefore coverage.
      queryClient.invalidateQueries();
    },
  });
}

/** Excel template: a Data sheet with the headers and a Columns sheet explaining each one. */
export const downloadTemplate = (entity: ImportEntity) =>
  downloadFile(`/import/${entity}/template.xlsx`);
