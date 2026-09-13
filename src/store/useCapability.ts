import { useEffect, useState } from "react";

/** Resolves a capability promise for a component: `undefined` while pending, `null` when absent. */
export function useCapability<T>(promise: Promise<T | null>): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    promise.then((v) => { if (live) setValue(v); }, () => { if (live) setValue(null); });
    return () => { live = false; };
  }, [promise]);
  return value;
}
