import { useEffect, useState } from "react";
import { clearTrusted, getTrusted, onTrustedChange, removeTrusted } from "../trust";
import { BUTTON, ConfirmButton } from "./ui";

export function TrustedSites() {
  const [domains, setDomains] = useState<string[] | null>(null);

  useEffect(() => {
    const show = (d: Set<string>) => setDomains([...d].sort());
    void getTrusted().then(show);
    return onTrustedChange(show);
  }, []);

  if (!domains) return <p className="px-4 py-8 text-center text-muted">Loading…</p>;

  return (
    <div className="px-4 pt-3.5 pb-3">
      <h2 className="text-[14px] font-bold">Trusted sites</h2>
      <p className="mt-1 text-[12px] text-muted">
        Trusting a site turns off its brand-name and login-word checks. Tricks like a hidden @ in the link or link text that lies
        about the destination are still flagged.
      </p>

      {domains.length === 0 ? (
        <p className="mt-3 rounded-lg bg-chip p-3 text-muted">
          No trusted sites yet. Use Trust on a flagged link's warning card to stop flagging a site you know is fine.
        </p>
      ) : (
        <>
          <ul className="mt-3 max-h-[300px] divide-y divide-divider overflow-y-auto rounded-lg border border-divider">
            {domains.map((d) => (
              <li key={d} className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{d}</span>
                <button type="button" className={BUTTON.quiet} onClick={() => void removeTrusted(d)} aria-label={`Remove ${d}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end">
            <ConfirmButton label="Clear all" question="Remove every trusted site?" confirmLabel="Clear all" onConfirm={() => void clearTrusted()} />
          </div>
        </>
      )}
    </div>
  );
}
