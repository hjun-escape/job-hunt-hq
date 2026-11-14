import { useSyncExternalStore } from "react";
import type { Profile, RecordSets, Settings } from "../domain/types";

export interface StoreState extends RecordSets {
  ready: boolean;
  readOnly: boolean;
  /** Editor or owner. Below that, the private pages' records are hidden by the db access rules. */
  canEdit: boolean;
  settings: Settings | null;
  profile: Profile | null;
}

export type StorePatch = Partial<StoreState> | ((state: StoreState) => Partial<StoreState>);

export interface Store {
  getState(): StoreState;
  setState(patch: StorePatch): void;
  subscribe(listener: () => void): () => void;
}

export function emptyState(): StoreState {
  return { ready: false, readOnly: false, canEdit: true, settings: null, profile: null, applications: {}, companies: {}, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} };
}

export function createStore(initial: Partial<StoreState> = {}): Store {
  let state: StoreState = { ...emptyState(), ...initial };
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStoreState(store: Store): StoreState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
