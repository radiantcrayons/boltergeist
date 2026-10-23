import type { RetryErrorInfo, RetryStrategyV2, RetryToken } from "@smithy/types";

// How the table is asked again when it says no for now: up to six tries, each after a random wait up to a doubling ceiling,
// longer when it's throttling. Every client keeps its own count, so one burst of moves can't use up everyone's retries.
export const ATTEMPTS = 6;

export function backoff(retry: number, throttled: boolean): number {
  const base = throttled ? 200 : 40;
  return Math.random() * Math.min(throttled ? 5000 : 1000, base * 2 ** retry);
}

const token = (count: number, delay: number): RetryToken => ({ getRetryCount: () => count, getRetryDelay: () => delay });

export function patient(): RetryStrategyV2 {
  return {
    acquireInitialRetryToken: async () => token(0, 0),
    refreshRetryTokenForRetry: async (t: RetryToken, info: RetryErrorInfo) => {
      const count = t.getRetryCount() + 1;
      if (count >= ATTEMPTS || info.errorType === "CLIENT_ERROR") throw new Error("No more tries");
      return token(count, backoff(count, info.errorType === "THROTTLING"));
    },
    recordSuccess: () => {},
  };
}

const THROTTLED = new Set(["ThrottlingError", "ProvisionedThroughputExceeded", "RequestLimitExceeded"]);
const PASSING = new Set(["None", "TransactionConflict", ...THROTTLED]);

// A transaction the table turned away only because it was busy (throttled, perhaps alongside a conflict), and none of its
// conditions failed: worth sending again, not a mistake of the player's.
export function busy(err: unknown): boolean {
  const e = err as { name?: string; CancellationReasons?: { Code?: string }[] } | null;
  if (e?.name !== "TransactionCanceledException") return false;
  const codes = (e.CancellationReasons ?? []).map((r) => r.Code ?? "None");
  return codes.some((c) => THROTTLED.has(c)) && codes.every((c) => PASSING.has(c));
}
