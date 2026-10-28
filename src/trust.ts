/** The user's trusted domains, kept in chrome.storage.local so they survive restarts. */

const KEY = "trustedDomains";

/** Registrable domains only: no scheme, path, port or spaces. */
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function toSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((d): d is string => typeof d === "string" && DOMAIN_RE.test(d)));
}

async function save(domains: Set<string>): Promise<void> {
  await chrome.storage.local.set({ [KEY]: [...domains].sort() });
}

export async function getTrusted(): Promise<Set<string>> {
  const res = await chrome.storage.local.get(KEY);
  return toSet(res[KEY]);
}

export async function addTrusted(domain: string): Promise<void> {
  const d = domain.toLowerCase();
  if (!DOMAIN_RE.test(d)) return;
  const set = await getTrusted();
  set.add(d);
  await save(set);
}

export async function removeTrusted(domain: string): Promise<void> {
  const set = await getTrusted();
  set.delete(domain.toLowerCase());
  await save(set);
}

export async function clearTrusted(): Promise<void> {
  await save(new Set());
}

/** Returns a function that stops listening. */
export function onTrustedChange(cb: (domains: Set<string>) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && KEY in changes) cb(toSet(changes[KEY]?.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
