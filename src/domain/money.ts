import type { Comp, Settings } from "./types";

export function normalizeAmount(amount: number, currency: string, settings: Pick<Settings, "displayCurrency" | "fxRates">): number | null {
  if (currency === settings.displayCurrency) return amount;
  const rate = settings.fxRates[currency];
  if (!rate || rate <= 0) return null;
  return Math.round(amount * rate);
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString()} ${currency}`;
  }
}

export function formatCompRange(comp: Comp | undefined): string {
  if (!comp || (comp.min == null && comp.max == null)) return "—";
  const min = comp.min != null ? formatMoney(comp.min, comp.currency) : null;
  const max = comp.max != null ? formatMoney(comp.max, comp.currency) : null;
  const range = min && max ? `${min}–${max}` : min ? `from ${min}` : `up to ${max}`;
  return `${range} / ${comp.period}`;
}

/** The range in the display currency, or null when an amount cannot be converted (no rate) or nothing is set. */
export function formatNormalizedRange(comp: Comp | undefined, settings: Pick<Settings, "displayCurrency" | "fxRates">): string | null {
  if (!comp || (comp.min == null && comp.max == null)) return null;
  const conv = (n: number | undefined) => (n == null ? undefined : normalizeAmount(n, comp.currency, settings));
  const min = conv(comp.min);
  const max = conv(comp.max);
  if ((comp.min != null && min == null) || (comp.max != null && max == null)) return null;
  const f = (n: number) => formatMoney(n, settings.displayCurrency);
  if (min != null && max != null) return `${f(min)}–${f(max)}`;
  return min != null ? `from ${f(min)}` : `up to ${f(max as number)}`;
}
