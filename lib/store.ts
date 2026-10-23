export const PREFIX = "tradewars.";

export function recall<T>(key: string, fallback: T): T {
  try {
    const kept = localStorage.getItem(PREFIX + key);
    return kept ? (JSON.parse(kept) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}
