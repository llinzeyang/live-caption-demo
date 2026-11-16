/** Build a caption stream WebSocket URL (same-origin, or NEXT_PUBLIC_WS_ORIGIN). */
export function captionStreamUrl(
  path: string,
  params: URLSearchParams,
): string {
  const override = process.env.NEXT_PUBLIC_WS_ORIGIN?.trim();
  if (override) {
    const base = override.replace(/\/$/, "");
    return `${base}${path}?${params}`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}?${params}`;
}
