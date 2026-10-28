// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLASH_ATTR, FLASH_MS, revealLink } from "../src/reveal";

let link: HTMLAnchorElement;

beforeEach(() => {
  vi.useFakeTimers();
  link = document.createElement("a");
  link.href = "https://evil.example/";
  document.body.append(link);
  link.scrollIntoView = vi.fn();
  link.click = vi.fn();
  link.focus = vi.fn();
  // happy-dom doesn't lay out, so say it's rendered unless a test hides it.
  link.getClientRects = () => [{}] as unknown as DOMRectList;
});

afterEach(() => {
  link.remove();
  vi.useRealTimers();
});

describe("revealLink", () => {
  it("scrolls the link to the middle and flashes it, then clears the flash", () => {
    expect(revealLink(link)).toBe(true);
    expect(link.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
    expect(link.hasAttribute(FLASH_ATTR)).toBe(true);
    vi.advanceTimersByTime(FLASH_MS);
    expect(link.hasAttribute(FLASH_ATTR)).toBe(false);
  });

  it("never clicks or focuses the link", () => {
    revealLink(link);
    expect(link.click).not.toHaveBeenCalled();
    expect(link.focus).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(link);
  });

  it("a second reveal restarts the flash instead of cutting it short", () => {
    revealLink(link);
    vi.advanceTimersByTime(FLASH_MS - 100);
    revealLink(link);
    vi.advanceTimersByTime(500);
    expect(link.hasAttribute(FLASH_ATTR)).toBe(true);
  });

  it("returns false for a missing, removed or hidden link", () => {
    expect(revealLink(undefined)).toBe(false);
    link.getClientRects = () => [] as unknown as DOMRectList;
    expect(revealLink(link)).toBe(false);
    link.getClientRects = () => [{}] as unknown as DOMRectList;
    link.remove();
    expect(revealLink(link)).toBe(false);
    expect(link.scrollIntoView).not.toHaveBeenCalled();
  });
});
