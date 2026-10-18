import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './import.parse';

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
