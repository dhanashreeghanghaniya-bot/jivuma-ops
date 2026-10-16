'use client';

import { useEffect, useState } from 'react';

/**
 * Holds back a rapidly changing value so it can be used in a query key without
 * firing a request per keystroke. Field staff are often on slow mobile data.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
