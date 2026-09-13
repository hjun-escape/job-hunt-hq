export function errorCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return undefined;
}

export function isTransient(e: unknown): boolean {
  return errorCode(e) === "unavailable";
}

export function describeDbError(e: unknown): string {
  switch (errorCode(e)) {
    case "quota_exceeded":
      return "Storage is full. Delete some records before adding more.";
    case "resource_exhausted":
      return "Too many changes at once. Wait a moment and try again.";
    case "unavailable":
      return "Storage is temporarily unavailable. Try again.";
    case "revoked":
      return "Access to storage was withdrawn. Reload the page.";
    case "invalid_argument":
      return "That change was rejected as invalid.";
    case "read_only":
      return "Storage is unavailable in this view, so changes cannot be saved.";
    default:
      return "Could not save. Try again.";
  }
}
