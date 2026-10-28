/**
 * Debounces rescans after DOM changes, but with a ceiling: a page that never stops changing (a live clock,
 * a ticker, rotating ads) would otherwise keep resetting a plain debounce, and new links would never be
 * scanned.
 */
export function createScanScheduler(run: () => void, debounceMs: number, maxWaitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** When the oldest change still waiting for a scan happened. */
  let firstPendingAt: number | undefined;

  function fire(): void {
    timer = undefined;
    firstPendingAt = undefined;
    run();
  }

  return {
    schedule(): void {
      const now = Date.now();
      firstPendingAt ??= now;
      clearTimeout(timer);
      const untilCeiling = firstPendingAt + maxWaitMs - now;
      timer = setTimeout(fire, Math.max(0, Math.min(debounceMs, untilCeiling)));
    },
    cancel(): void {
      clearTimeout(timer);
      timer = undefined;
      firstPendingAt = undefined;
    },
  };
}
