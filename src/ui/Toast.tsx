import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ToastKind = "info" | "success" | "error";
interface ToastItem { id: number; message: string; kind: ToastKind }
export interface ToastApi { show(message: string, kind?: ToastKind): void }

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, message, kind }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === "error" ? 8000 : 4000);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(ToastContext);
  if (!v) throw new Error("ToastProvider is missing");
  return v;
}
