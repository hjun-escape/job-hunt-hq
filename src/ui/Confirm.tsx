import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the confirm button stays disabled until the viewer types this exact phrase. */
  typed?: string;
}
type ConfirmFn = (req: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ req: ConfirmRequest; resolve: (v: boolean) => void } | null>(null);
  const [typed, setTyped] = useState("");
  const confirm = useCallback<ConfirmFn>((req) => new Promise((resolve) => { setTyped(""); setPending({ req, resolve }); }), []);
  const finish = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };
  const value = useMemo(() => confirm, [confirm]);
  const locked = !!pending?.req.typed && typed !== pending.req.typed;
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? (
        <div className="modal-backdrop" onClick={() => finish(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-title">{pending.req.title}</h2>
            <p>{pending.req.message}</p>
            {pending.req.typed ? (
              <label className="field">
                <span className="field-label">Type {pending.req.typed} to continue</span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </label>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => finish(false)} autoFocus>Cancel</button>
              <button type="button" className={pending.req.danger === false ? "btn primary" : "btn danger"} disabled={locked} onClick={() => finish(true)}>
                {pending.req.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const v = useContext(ConfirmContext);
  if (!v) throw new Error("ConfirmProvider is missing");
  return v;
}
