import type { Application, PriorityWeights, Tier } from "./types";

export function priorityScore(app: Pick<Application, "desire" | "fit" | "likelihood">, weights: PriorityWeights): number | null {
  if (app.desire == null || app.fit == null || app.likelihood == null) return null;
  const sum = weights.desire + weights.fit + weights.likelihood;
  if (sum <= 0) return null;
  const raw = weights.desire * app.desire + weights.fit * app.fit + weights.likelihood * app.likelihood;
  return Math.round((100 * raw) / (5 * sum));
}

export function suggestedTier(score: number | null): Tier | null {
  if (score == null) return null;
  if (score >= 75) return "A";
  if (score >= 50) return "B";
  return "C";
}
