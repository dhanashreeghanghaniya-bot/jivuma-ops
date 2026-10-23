import ExcelJS from 'exceljs';

export interface SheetColumn<T> {
  header: string;
  width?: number;
  /** Rupee amounts get the Indian `#,##,##0.00` format and are summed in the total row. */
  money?: boolean;
  /** Plain numbers summed in the total row. */
  sum?: boolean;
  value: (row: T) => string | number | null;
}

export interface SheetSpec<T> {
  name: string;
  title: string;
  subtitle?: string;
  columns: SheetColumn<T>[];
  rows: T[];
  /** Adds a bold "Total" row under the data. */
  totals?: boolean;
}

/** Keeps a sheet's row type checked against its columns, then erases it for the workbook. */
export const sheet = <T>(spec: SheetSpec<T>) => spec as unknown as SheetSpec<unknown>;

/** Indian digit grouping: 1,23,45,678.00 (SPEC 1: currency `₹1,23,456`). */
const INR_FORMAT = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';

/**
 * One workbook from one or more sheet specs: a title row, a header row, the
 * data with money formatted in the Indian style, and an optional total row.
 */
export async function buildWorkbook(sheets: SheetSpec<unknown>[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = 'Juma Ops';
  book.created = new Date();

  for (const spec of sheets) {
    const sheet = book.addWorksheet(spec.name.slice(0, 31));
    sheet.addRow([spec.title]).font = { bold: true, size: 13 };
    if (spec.subtitle)
      sheet.addRow([spec.subtitle]).font = { italic: true, color: { argb: 'FF666666' } };
    sheet.addRow([]);

    const header = sheet.addRow(spec.columns.map((c) => c.header));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F1EC' } };
      cell.border = { bottom: { style: 'thin' } };
    });
    const firstDataRow = header.number + 1;

    for (const row of spec.rows) {
      sheet.addRow(
        spec.columns.map((c) => {
          const v = c.value(row);
          return c.money && typeof v === 'string' ? Number(v) : v;
        }),
      );
    }
    const lastDataRow = sheet.lastRow!.number;

    if (spec.totals && spec.rows.length > 0) {
      const total = sheet.addRow(
        spec.columns.map((c, i) => {
          if (i === 0) return 'Total';
          if (!c.money && !c.sum) return null;
          const col = sheet.getColumn(i + 1).letter;
          return { formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})` };
        }),
      );
      total.font = { bold: true };
      total.eachCell((cell) => (cell.border = { top: { style: 'thin' } }));
    }

    spec.columns.forEach((c, i) => {
      const column = sheet.getColumn(i + 1);
      column.width = c.width ?? Math.max(10, c.header.length + 2);
      if (c.money) column.numFmt = INR_FORMAT;
    });
    sheet.views = [{ state: 'frozen', ySplit: header.number }];
  }

  return Buffer.from(await book.xlsx.writeBuffer());
}
