import ExcelJS from 'exceljs';
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

  return toRecords(rows);
}

/** Drops blank lines, takes the first remaining line as headers and keys each row by them. */
function toRecords(rows: string[][]): ImportRow[] {
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

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Excel stores whole numbers as floats; this keeps 9876543210 from becoming 9.87e9. */
function numberText(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : String(value);
}

/** Flattens every ExcelJS cell value shape to the plain text the CSV path would have given. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return numberText(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  // Excel dates carry no zone; ExcelJS reads them as UTC midnight, so the UTC date is the cell's date.
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('formula' in value || 'sharedFormula' in value) {
    const result = (value as ExcelJS.CellFormulaValue).result;
    return result === undefined ||
      (typeof result === 'object' && !(result instanceof Date) && 'error' in result)
      ? ''
      : cellText(result as ExcelJS.CellValue);
  }
  if ('hyperlink' in value) return cellText(value.text as ExcelJS.CellValue);
  return '';
}

/**
 * Reads the first worksheet of an .xlsx file into rows keyed by the header
 * row, so an Excel upload goes through exactly the same checks as a CSV.
 */
export async function parseXlsx(buffer: Buffer): Promise<ImportRow[]> {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw ApiException.badRequest('This is not a readable Excel (.xlsx) file');
  }
  const sheet = book.worksheets[0];
  if (!sheet) throw ApiException.badRequest('The file is empty');

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let col = 1; col <= row.cellCount; col++) cells.push(cellText(row.getCell(col).value));
    rows.push(cells);
  });
  return toRecords(rows);
}
