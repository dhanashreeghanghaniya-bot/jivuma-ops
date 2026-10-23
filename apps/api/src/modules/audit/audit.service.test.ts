import { describe, expect, it } from 'vitest';
import { auditQuerySchema } from '@juma/shared';
import { diffSnapshots } from './audit.service';

describe('diffSnapshots', () => {
  it('lists only the fields an update changed, ignoring timestamps', () => {
    expect(
      diffSnapshots(
        { status: 'ACTIVE', creditLimit: '1000.00', tags: ['a'], updatedAt: '2026-01-01' },
        { status: 'ON_HOLD', creditLimit: '1000.00', tags: ['a', 'b'], updatedAt: '2026-02-01' },
      ),
    ).toEqual([
      { field: 'status', before: 'ACTIVE', after: 'ON_HOLD' },
      { field: 'tags', before: ['a'], after: ['a', 'b'] },
    ]);
  });

  it('lists every set field for a create and a delete', () => {
    expect(diffSnapshots(null, { name: 'Gondal', note: null }).map((c) => c.field)).toEqual([
      'name',
    ]);
    expect(diffSnapshots({ name: 'Gondal' }, null)).toEqual([
      { field: 'name', before: 'Gondal', after: null },
    ]);
  });

  it('handles snapshots that are not objects', () => {
    expect(diffSnapshots(null, null)).toEqual([]);
    expect(diffSnapshots('a', 'b')).toEqual([{ field: '(value)', before: 'a', after: 'b' }]);
  });
});

describe('auditQuerySchema', () => {
  it('defaults the page and rejects a reversed range', () => {
    expect(auditQuerySchema.parse({}).page).toBe(1);
    expect(auditQuerySchema.safeParse({ from: '2026-10-05', to: '2026-10-01' }).success).toBe(
      false,
    );
    expect(auditQuerySchema.safeParse({ action: 'PURGE' }).success).toBe(false);
  });
});
