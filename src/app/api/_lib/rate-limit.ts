type RateEntry = { count: number; resetAt: number };

const memory = globalThis as typeof globalThis & {
  __soundCueRates?: Map<string, RateEntry>;
};
const entries = memory.__soundCueRates ?? new Map<string, RateEntry>();
memory.__soundCueRates = entries;

/**
 * A conservative per-instance guard. Production should additionally enforce a
 * distributed limit at the edge or in the database.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const current = entries.get(key);
  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
