import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createScanScheduler } from "../src/scheduler";

describe("scan scheduler", () => {
  let run: Mock<() => void>;
  let s: ReturnType<typeof createScanScheduler>;

  beforeEach(() => {
    vi.useFakeTimers();
    run = vi.fn<() => void>();
    s = createScanScheduler(run, 300, 1000);
  });
  afterEach(() => vi.useRealTimers());

  it("waits for the page to settle", () => {
    s.schedule();
    vi.advanceTimersByTime(299);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledOnce();
  });

  it("batches a burst of changes into one scan", () => {
    for (let i = 0; i < 5; i++) {
      s.schedule();
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledOnce();
  });

  it("still scans at least once a second on a page that never stops changing", () => {
    // A change every 100 ms would reset a plain 300 ms debounce forever.
    for (let t = 0; t < 3000; t += 100) {
      s.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(run.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("cancel stops a pending scan", () => {
    s.schedule();
    s.cancel();
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
  });
});
