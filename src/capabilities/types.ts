// The ambient contracts live in src/types/claude/*.d.ts (global declarations).
export type DbLike = DB;
export type AssetsLike = Claude.Assets;
export type DownloadsLike = typeof Claude.downloads;
export type SampleLike = typeof Claude.sample;
/** The one `user` read the app needs: Editor or owner (the `admin` db level), never rejects. */
export interface ViewerLike {
  canEdit(): Promise<boolean>;
}

export interface Capabilities {
  db: Promise<DbLike | null>;
  assets: Promise<AssetsLike | null>;
  downloads: Promise<DownloadsLike | null>;
  sample: Promise<SampleLike | null>;
  user: Promise<ViewerLike | null>;
}

export function absentCapabilities(): Capabilities {
  return {
    db: Promise.resolve(null),
    assets: Promise.resolve(null),
    downloads: Promise.resolve(null),
    sample: Promise.resolve(null),
    user: Promise.resolve(null),
  };
}
