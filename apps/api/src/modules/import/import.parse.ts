import type { ImportRow } from '@juma/shared';
import { ApiException } from '../../lib/http';

/**
 * RFC 4180 CSV reader: handles quoted fields, escaped quotes, embedded commas
 * and newlines, and both CRLF and LF line endings.
 */
export function parseCsv(text: string): ImportRow[] {
  // A UTF-8 BOM is normal in Excel-exported CSVs and would corrupt the first header.
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
    } else {
      field += char;
    }
  }

  // Flush whatever the final line left behind, unless the file ended cleanly.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  const headerRow = nonEmpty[0];
  if (!headerRow) throw ApiException.badRequest('The file is empty');

  const headers = headerRow.map((h) => h.trim());
  if (headers.every((h) => h === '')) throw ApiException.badRequest('The header row is missing');

  return nonEmpty.slice(1).map((cells) => {
    const record: ImportRow = {};
    headers.forEach((header, index) => {
      if (header) record[header] = (cells[index] ?? '').trim();
    });
    return record;
  });
}

/** Quotes a cell only when it needs it, so templates stay readable. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((cells) => cells.map(csvCell).join(','));
  // Excel needs the BOM to read UTF-8 (Gujarati names) correctly.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
