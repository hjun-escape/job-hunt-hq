import type { Application, AssetDoc } from "./types";

export function assetsOfKind(assets: AssetDoc[], kindIds: string[]): AssetDoc[] {
  return assets.filter((a) => kindIds.includes(a.kindId));
}

export function assetUsage(assetId: string, apps: Application[]) {
  return {
    asResume: apps.filter((a) => a.resumeAssetId === assetId),
    asCoverLetter: apps.filter((a) => a.coverLetterAssetId === assetId),
  };
}

export function isAssetReferenced(assetId: string, apps: Application[]): boolean {
  const u = assetUsage(assetId, apps);
  return u.asResume.length + u.asCoverLetter.length > 0;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
