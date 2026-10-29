/**
 * One request per key at a time. The cart page and the add toast often ask the server about the
 * same cart in the same moment; they now share the answer instead of sending the request twice.
 * A failure resolves to null, as the quote's callers already expect, and is not remembered.
 */
const inflight = new Map<string, Promise<unknown>>();

export function sharedRequest<T>(key: string, request: () => Promise<T>): Promise<T | null> {
  const pending = inflight.get(key) as Promise<T | null> | undefined;
  if (pending) return pending;
  const next = request()
    .catch(() => null)
    .finally(() => inflight.delete(key));
  inflight.set(key, next);
  return next;
}
