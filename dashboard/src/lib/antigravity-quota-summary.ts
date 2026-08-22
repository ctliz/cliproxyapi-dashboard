import type { QuotaGroup, QuotaWindowType } from "@/lib/model-first-monitoring";

export const ANTIGRAVITY_QUOTA_SUMMARY_ENDPOINTS = [
  "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary",
  "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
] as const;

interface AntigravityQuotaBucketPayload {
  bucketId?: unknown;
  bucket_id?: unknown;
  displayName?: unknown;
  display_name?: unknown;
  window?: unknown;
  remainingFraction?: unknown;
  remaining_fraction?: unknown;
  resetTime?: unknown;
  reset_time?: unknown;
}

interface AntigravityQuotaGroupPayload {
  displayName?: unknown;
  display_name?: unknown;
  buckets?: unknown;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fractionValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, parsed));
}

function stableId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function windowType(value: string | null): QuotaWindowType {
  switch (value?.toLowerCase()) {
    case "5h":
    case "five-hour":
    case "five_hour":
      return "five-hour";
    case "week":
    case "weekly":
      return "weekly";
    default:
      return "provider";
  }
}

export function parseAntigravityQuotaSummary(payload: unknown): QuotaGroup[] | null {
  if (!payload || typeof payload !== "object") return null;
  const groups = (payload as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return null;

  const result: QuotaGroup[] = [];

  groups.forEach((rawGroup, groupIndex) => {
    if (!rawGroup || typeof rawGroup !== "object") return;
    const group = rawGroup as AntigravityQuotaGroupPayload;
    const groupLabel =
      stringValue(group.displayName ?? group.display_name) ?? `Quota Group ${groupIndex + 1}`;
    if (!Array.isArray(group.buckets)) return;

    group.buckets.forEach((rawBucket, bucketIndex) => {
      if (!rawBucket || typeof rawBucket !== "object") return;
      const bucket = rawBucket as AntigravityQuotaBucketPayload;
      const remainingFraction = fractionValue(
        bucket.remainingFraction ?? bucket.remaining_fraction
      );
      if (remainingFraction === null) return;

      const rawWindow = stringValue(bucket.window);
      const type = windowType(rawWindow);
      const bucketLabel =
        stringValue(bucket.displayName ?? bucket.display_name) ?? rawWindow ?? `Limit ${bucketIndex + 1}`;
      const rawBucketId = stringValue(bucket.bucketId ?? bucket.bucket_id);
      const id = rawBucketId ?? `${stableId(groupLabel)}-${stableId(rawWindow ?? bucketLabel)}`;
      const resetTime = stringValue(bucket.resetTime ?? bucket.reset_time);
      const label = `${groupLabel} - ${bucketLabel}`;

      result.push({
        id,
        label,
        remainingFraction,
        resetTime,
        windowType: type,
        models: [
          {
            id,
            displayName: groupLabel,
            remainingFraction,
            resetTime,
          },
        ],
      });
    });
  });

  return result.length > 0 ? result : null;
}
