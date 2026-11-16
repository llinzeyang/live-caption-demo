/** Shared backoff helpers for Vercel WS maxDuration disconnects. */

export const WS_RECONNECT_MAX_ATTEMPTS = 8;
export const WS_RECONNECT_BASE_MS = 1000;
export const WS_RECONNECT_MAX_MS = 30000;

export function nextReconnectDelayMs(attempt: number): number {
  const exp = Math.min(
    WS_RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1),
    WS_RECONNECT_MAX_MS,
  );
  return exp;
}
