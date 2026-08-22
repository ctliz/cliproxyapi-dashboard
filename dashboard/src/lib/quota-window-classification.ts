export interface QuotaWindowLike {
  id: string;
  label: string;
  resetTime: string | null;
  windowType?: "weekly" | "five-hour" | "provider";
}

function hasExplicitShortTermMarker(group: QuotaWindowLike): boolean {
  const id = group.id.toLowerCase();
  const label = group.label.toLowerCase();

  return (
    id.includes("five-hour") ||
    id.includes("five_hour") ||
    id.endsWith("-5h") ||
    label.includes("5h") ||
    label.includes("5 hour") ||
    label.includes("5-hour")
  );
}

function hasExplicitLongTermMarker(group: QuotaWindowLike): boolean {
  const value = `${group.id} ${group.label}`.toLowerCase();
  return (
    value.includes("weekly") ||
    value.includes("seven-day") ||
    value.includes("7d") ||
    value.includes("168h") ||
    value.includes("monthly")
  );
}

export function isShortTermQuotaWindow(
  group: QuotaWindowLike,
  siblingGroups: readonly QuotaWindowLike[] = []
): boolean {
  if (group.windowType === "five-hour") return true;
  if (group.windowType === "weekly" || group.windowType === "provider") return false;

  if (hasExplicitShortTermMarker(group)) {
    return true;
  }
  if (hasExplicitLongTermMarker(group)) return false;

  // Reset proximity cannot identify a window: a weekly limit is also less than
  // 24 hours from reset near the end of its cycle. Unknown windows stay long-term.
  void siblingGroups;
  return false;
}
