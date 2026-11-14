import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities/types";
import { browserTimeZone, defaultProfile, defaultSettings } from "../domain/defaults";
import { nowIso } from "../domain/ids";
import { AppContext, type AppServices } from "../store/context";
import { Repository } from "../store/repository";
import { createStore } from "../store/store";
import { startSync, type SyncHandle } from "../store/sync";
import { ConfirmProvider } from "../ui/Confirm";
import { ToastProvider } from "../ui/Toast";
import { ErrorBoundary } from "./ErrorBoundary";
import { Shell } from "./Shell";

export function App({ capabilities }: { capabilities: Capabilities }) {
  const [services, setServices] = useState<AppServices | null>(null);

  useEffect(() => {
    let cancelled = false;
    let handle: SyncHandle | undefined;
    const store = createStore();
    // No `user` capability (an older host, or tests) keeps today's behaviour: treat the viewer as an editor.
    const canEditP = capabilities.user.then((u) => (u ? u.canEdit() : true));
    void Promise.all([capabilities.db, canEditP]).then(([db, canEdit]) => {
      if (cancelled) return;
      const repo = new Repository(db, store);
      store.setState({ canEdit });
      if (db) {
        handle = startSync(db, store, { homeTz: browserTimeZone(), canEdit, onError: (e) => console.warn("storage", e.code, e.message) });
      } else {
        const now = nowIso();
        store.setState({ readOnly: true, ready: true, settings: defaultSettings(browserTimeZone(), now), profile: defaultProfile(now) });
      }
      setServices({ store, repo, caps: capabilities });
    });
    return () => {
      cancelled = true;
      handle?.stop();
    };
  }, [capabilities]);

  if (!services) return <div className="boot">Loading…</div>;
  return (
    <AppContext.Provider value={services}>
      <ToastProvider>
        <ConfirmProvider>
          <ErrorBoundary>
            <Shell />
          </ErrorBoundary>
        </ConfirmProvider>
      </ToastProvider>
    </AppContext.Provider>
  );
}
