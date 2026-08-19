const EXTERNAL_FETCH_TIMEOUT_MS = 8_000;

/** Bounds third-party API latency so one stalled provider cannot hold a route open. */
export function fetchExternal(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
  });
}
