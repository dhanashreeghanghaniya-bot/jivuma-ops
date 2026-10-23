import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { IMPORT_COLUMNS } from '@juma/shared';
import { cellText, parseCsv, parseXlsx, toCsv } from './import.parse';
import { templateXlsx } from './import.service';

describe('parseCsv', () => {
  it('maps the header row onto each record', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('trims cells and headers', () => {
    expect(parseCsv(' a , b \n 1 , 2 ')).toEqual([{ a: '1', b: '2' }]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('name,address\nShop,"Main Road, Gondal"')).toEqual([
      { name: 'Shop', address: 'Main Road, Gondal' },
    ]);
  });

  it('handles escaped quotes inside a quoted field', () => {
    expect(parseCsv('name\n"The ""Big"" Store"')).toEqual([{ name: 'The "Big" Store' }]);
  });

  it('handles newlines inside a quoted field', () => {
    expect(parseCsv('name,notes\nShop,"line one\nline two"')).toEqual([
      { name: 'Shop', notes: 'line one\nline two' },
    ]);
  });

  it('accepts CRLF line endings from Excel', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('strips the UTF-8 BOM Excel writes, so the first header is usable', () => {
    expect(parseCsv('\uFEFFcode,name\nRJT,Rajkot')).toEqual([{ code: 'RJT', name: 'Rajkot' }]);
  });

  it('keeps Gujarati text intact', () => {
    expect(parseCsv('code,nameGu\nRJT,રાજકોટ')).toEqual([{ code: 'RJT', nameGu: 'રાજકોટ' }]);
  });

  it('skips blank lines rather than emitting empty records', () => {
    expect(parseCsv('a\n1\n\n2\n')).toEqual([{ a: '1' }, { a: '2' }]);
  });

  it('pads rows that are missing trailing cells', () => {
    expect(parseCsv('a,b,c\n1,2')).toEqual([{ a: '1', b: '2', c: '' }]);
  });

  it('rejects an empty file', () => {
    expect(() => parseCsv('   ')).toThrowError(/empty/i);
  });
});

describe('toCsv', () => {
  it('quotes only the cells that need it', () => {
    expect(toCsv(['a', 'b'], [['plain', 'has,comma']])).toBe('\uFEFFa,b\r\nplain,"has,comma"\r\n');
  });

  it('escapes embedded quotes', () => {
    expect(toCsv(['a'], [['say "hi"']])).toBe('\uFEFFa\r\n"say ""hi"""\r\n');
  });

  it('round-trips through the parser', () => {
    const csv = toCsv(
      ['name', 'address', 'notes'],
      [['Shop', 'Main Road, Gondal', 'He said "yes"']],
    );
    expect(parseCsv(csv)).toEqual([
      { name: 'Shop', address: 'Main Road, Gondal', notes: 'He said "yes"' },
    ]);
  });
});

async function workbook(rows: ExcelJS.CellValue[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Data');
  rows.forEach((row) => sheet.addRow(row));
  book.addWorksheet('Ignored').addRow(['x']);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('cellText', () => {
  it('keeps long whole numbers as digits', () => {
    expect(cellText(9876543210)).toBe('9876543210');
    expect(cellText(21.9608)).toBe('21.9608');
  });

  it('reads dates as YYYY-MM-DD', () => {
    expect(cellText(new Date(Date.UTC(2026, 10, 15)))).toBe('2026-11-15');
  });

  it('flattens rich text, formulas and hyperlinks', () => {
    expect(cellText({ richText: [{ text: 'Shree ' }, { text: 'Traders' }] })).toBe('Shree Traders');
    expect(cellText({ formula: 'A1*2', result: 500000 })).toBe('500000');
    expect(cellText({ formula: 'X()', result: { error: '#NAME?' } })).toBe('');
    expect(cellText({ text: 'a@b.in', hyperlink: 'mailto:a@b.in' })).toBe('a@b.in');
    expect(cellText(null)).toBe('');
  });
});

describe('parseXlsx', () => {
  it('reads the first sheet keyed by its header row, skipping blank rows', async () => {
    const file = await workbook([
      ['firmName', ' phone ', 'followUpAt'],
      ['Shree Traders', 9876543210, new Date(Date.UTC(2026, 10, 15))],
      [],
      ['  Mehta Agencies ', '9876543211', null],
    ]);
    expect(await parseXlsx(file)).toEqual([
      { firmName: 'Shree Traders', phone: '9876543210', followUpAt: '2026-11-15' },
      { firmName: 'Mehta Agencies', phone: '9876543211', followUpAt: '' },
    ]);
  });

  it('rejects a file that is not a workbook', async () => {
    await expect(parseXlsx(Buffer.from('a,b,c'))).rejects.toThrow('not a readable Excel');
  });

  it('rejects a workbook with no rows', async () => {
    await expect(parseXlsx(await workbook([]))).rejects.toThrow('empty');
  });

  it('round-trips the template: headers only, so an untouched template imports nothing', async () => {
    const file = await templateXlsx('retailers');
    expect(await parseXlsx(file)).toEqual([]);

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file as unknown as ArrayBuffer);
    const headers = (book.getWorksheet('Data')!.getRow(1).values as string[]).slice(1);
    expect(headers).toEqual(IMPORT_COLUMNS.retailers.map((c) => c.key));
    expect(book.getWorksheet('Columns')!.rowCount).toBeGreaterThan(IMPORT_COLUMNS.retailers.length);
  });
});
