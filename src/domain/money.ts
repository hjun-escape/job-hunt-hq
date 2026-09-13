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
  const range = min && max ? `${min}–${max}` : (min ?? max) as string;
  return `${range} / ${comp.period}`;
}
