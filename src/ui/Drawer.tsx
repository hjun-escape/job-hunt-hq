import { useCallback, useEffect, useRef, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Runs before Escape, the ✕ button or a backdrop click actually close the drawer; a falsy
   * result (or a rejected/false-resolving promise) keeps the drawer open. */
  closeGuard?: () => boolean | Promise<boolean>;
}

export function Drawer({ open, title, onClose, children, footer, wide, closeGuard }: DrawerProps) {
  const attempt = useCallback(async () => {
    if (closeGuard && !(await closeGuard())) return;
    onClose();
  }, [closeGuard, onClose]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void attempt();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, attempt]);
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    asideRef.current?.focus();
    return () => { previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onClick={() => void attempt()}>
      <aside ref={asideRef} tabIndex={-1} className={wide ? "drawer wide" : "drawer"} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div className="drawer-title">{title}</div>
          <button type="button" className="btn ghost" onClick={() => void attempt()} aria-label="Close">✕</button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}
