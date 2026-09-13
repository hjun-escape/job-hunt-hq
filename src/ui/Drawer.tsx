import { useEffect, useRef, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Drawer({ open, title, onClose, children, footer, wide }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    asideRef.current?.focus();
    return () => { previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside ref={asideRef} tabIndex={-1} className={wide ? "drawer wide" : "drawer"} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div className="drawer-title">{title}</div>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}
