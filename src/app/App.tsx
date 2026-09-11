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
import { Shell } from "./Shell";

export function App({ capabilities }: { capabilities: Capabilities }) {
  const [services, setServices] = useState<AppServices | null>(null);

  useEffect(() => {
    let cancelled = false;
    let handle: SyncHandle | undefined;
    const store = createStore();
    void capabilities.db.then((db) => {
      if (cancelled) return;
      const repo = new Repository(db, store);
      if (db) {
        handle = startSync(db, store, { homeTz: browserTimeZone() });
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
          <Shell />
        </ConfirmProvider>
      </ToastProvider>
    </AppContext.Provider>
  );
}
