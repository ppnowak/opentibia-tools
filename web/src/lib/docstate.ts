import { useState } from 'preact/hooks';

const store = new Map<string, unknown>();

/** useState whose value survives switching editor tabs (keyed by document and field). */
export function useDocState<T>(doc: string, field: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const key = `${doc}::${field}`;
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));
  const set = (v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      store.set(key, next);
      return next;
    });
  };
  return [value, set];
}
