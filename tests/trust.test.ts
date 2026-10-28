import { beforeEach, describe, expect, it, vi } from "vitest";
import { addTrusted, clearTrusted, getTrusted, onTrustedChange, removeTrusted } from "../src/trust";

let store: Record<string, unknown>;
let listeners: ((changes: Record<string, { newValue?: unknown }>, area: string) => void)[];

beforeEach(() => {
  store = {};
  listeners = [];
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, items);
          for (const l of listeners) l(Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { newValue: v }])), "local");
        },
      },
      onChanged: {
        addListener: (l: (typeof listeners)[number]) => listeners.push(l),
        removeListener: (l: (typeof listeners)[number]) => listeners.splice(listeners.indexOf(l), 1),
      },
    },
  });
});

describe("trusted domain storage", () => {
  it("starts empty", async () => {
    expect(await getTrusted()).toEqual(new Set());
  });

  it("adds, lowercases, de-duplicates and removes", async () => {
    await addTrusted("Example.com");
    await addTrusted("example.com");
    await addTrusted("instructure.com");
    expect(store.trustedDomains).toEqual(["example.com", "instructure.com"]);
    await removeTrusted("example.com");
    expect(await getTrusted()).toEqual(new Set(["instructure.com"]));
  });

  it("clears everything", async () => {
    await addTrusted("example.com");
    await clearTrusted();
    expect(await getTrusted()).toEqual(new Set());
  });

  it("rejects anything that is not a bare domain", async () => {
    for (const bad of ["https://example.com", "example.com/path", "exa mple.com", "localhost", "", "example.com:8080"]) {
      await addTrusted(bad);
    }
    expect(await getTrusted()).toEqual(new Set());
  });

  it("ignores malformed stored values", async () => {
    store.trustedDomains = ["ok.com", 42, null, "not a domain", { x: 1 }];
    expect(await getTrusted()).toEqual(new Set(["ok.com"]));
  });

  it("notifies listeners with the new list until unsubscribed", async () => {
    const seen: Set<string>[] = [];
    const stop = onTrustedChange((d) => seen.push(d));
    await addTrusted("example.com");
    expect(seen.at(-1)).toEqual(new Set(["example.com"]));
    stop();
    await addTrusted("other.com");
    expect(seen).toHaveLength(1);
  });
});
