import { createContext, useContext } from "react";
import type { Capabilities } from "../capabilities/types";
import type { Profile, Settings } from "../domain/types";
import type { Repository } from "./repository";
import { useStoreState, type Store, type StoreState } from "./store";

export interface AppServices {
  store: Store;
  repo: Repository;
  caps: Capabilities;
}

export const AppContext = createContext<AppServices | null>(null);

export function useApp(): AppServices {
  const v = useContext(AppContext);
  if (!v) throw new Error("AppContext is missing");
  return v;
}

export function useAppState(): StoreState {
  return useStoreState(useApp().store);
}

export function useSettings(): Settings {
  const s = useAppState().settings;
  if (!s) throw new Error("settings are not loaded");
  return s;
}

export function useProfile(): Profile {
  const p = useAppState().profile;
  if (!p) throw new Error("profile is not loaded");
  return p;
}
