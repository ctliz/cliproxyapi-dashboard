import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { usageCache } from "@/lib/cache";
import { Errors } from "@/lib/errors";
import { Prisma } from "@/generated/prisma/client";

// Cache for 5 seconds to allow frequent polling without overwhelming the database
// The frontend polls every 60 seconds, so 5s cache won't cause missed updates
const USAGE_HISTORY_CACHE_TTL_MS = 5_000;
const REQUEST_EVENT_LIMIT = 200;
const LATENCY_SERIES_LIMIT = 120;

interface KeyUsage {
  keyName: string;
  username?: string;
  userId?: string;
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  successCount: number;
  failureCount: number;
  models: Record<string, {
    totalRequests: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    pricingBuckets: PricingBucket[];
  }>;
}

interface PricingBucket {
  requests: number;
  inputTokens: number;
  uncachedInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  longContext: boolean;
  serviceTier: string;
}

interface RequestEvent {
  timestamp: string;
  keyName: string;
  username?: string;
  model: string;
  latencyMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  failed: boolean;
}

interface LatencyPoint {
  timestamp: string;
  keyName: string;
  username?: string;
  model: string;
  latencyMs: number;
  failed: boolean;
}

interface LatencySummary {
  sampleCount: number;
  averageMs: number;
  p95Ms: number;
  maxMs: number;
}

function isValidDateParam(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  const [year, month, day] = dateString.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function dbNumber(value: bigint | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : 0;
}

export async function GET(request: NextRequest) {
  const requestStartedAt = Date.now();
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  const searchParams = request.nextUrl.searchParams;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (!fromParam || !toParam) {
    return Errors.missingFields(["from", "to"]);
  }

  if (!isValidDateParam(fromParam) || !isValidDateParam(toParam)) {
    return Errors.validation("Invalid date format. Use YYYY-MM-DD.");
  }

  const [fromYear, fromMonth, fromDay] = fromParam.split("-").map(Number) as [number, number, number];
  const [toYear, toMonth, toDay] = toParam.split("-").map(Number) as [number, number, number];
  const fromDate = new Date(fromYear, fromMonth - 1, fromDay);
  const toDate = new Date(toYear, toMonth - 1, toDay, 23, 59, 59, 999);

  if (fromDate > toDate) {
    return Errors.validation("from date must be before to date");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { isAdmin: true, username: true },
    });
    const isAdmin = user?.isAdmin ?? false;
    const cacheKey = `usage-history:v1:${session.userId}:${isAdmin ? "admin" : "user"}:${fromParam}:${toParam}`;
    const cached = usageCache.get(cacheKey) as { data: unknown; isAdmin: boolean } | null;
    if (cached) {
      logger.debug({ userId: session.userId, from: fromParam, to: toParam }, "Usage history cache hit");
      return NextResponse.json(cached);
    }

    let sourceFilter: string[] = [];
    if (!isAdmin) {
      const oauthOwnerships = await prisma.providerOAuthOwnership.findMany({
        where: { userId: session.userId },
        select: { accountName: true, accountEmail: true },
      });
      sourceFilter = [];
      if (user?.username) sourceFilter.push(user.username);
      for (const o of oauthOwnerships) {
        if (o.accountEmail) sourceFilter.push(o.accountEmail);
        sourceFilter.push(o.accountName);
      }
    }

    const sourceAccess = sourceFilter.length > 0
      ? Prisma.sql` OR r."source" IN (${Prisma.join(sourceFilter)})`
      : Prisma.sql``;
    const accessFilter = isAdmin
      ? Prisma.sql``
      : Prisma.sql`AND (r."userId" = ${session.userId}${sourceAccess})`;
    const whereSql = Prisma.sql`
      WHERE r."timestamp" >= ${fromDate}
        AND r."timestamp" <= ${toDate}
        AND r."apiKeyId" IS NOT NULL
        ${accessFilter}
    `;
    const legacyIndependentCache = Prisma.sql`r."totalTokens" > r."inputTokens" + r."outputTokens"`;
    const effectiveInput = Prisma.sql`CASE
      WHEN r."accountingVersion" >= 2 THEN r."inputTotalTokens"
      WHEN ${legacyIndependentCache} THEN GREATEST(r."totalTokens" - r."outputTokens", 0)
      ELSE r."inputTokens"
    END`;
    const effectiveUncached = Prisma.sql`CASE
      WHEN r."accountingVersion" >= 2 THEN r."uncachedInputTokens"
      WHEN ${legacyIndependentCache} THEN r."inputTokens"
      ELSE GREATEST(r."inputTokens" - r."cachedTokens", 0)
    END`;
    const effectiveOutput = Prisma.sql`CASE WHEN r."accountingVersion" >= 2 THEN r."outputTotalTokens" ELSE r."outputTokens" END`;
    const effectiveCached = Prisma.sql`CASE WHEN r."accountingVersion" >= 2 THEN r."cacheReadTokens" ELSE r."cachedTokens" END`;
    const effectiveCacheWrite = Prisma.sql`CASE
      WHEN r."accountingVersion" >= 2 THEN r."cacheWriteTokens"
      WHEN ${legacyIndependentCache} THEN GREATEST(r."totalTokens" - r."inputTokens" - r."cachedTokens" - r."outputTokens", 0)
      ELSE 0
    END`;
    const effectiveServiceTier = Prisma.sql`COALESCE(NULLIF(r."responseServiceTier", ''), NULLIF(r."serviceTier", ''), 'standard')`;
    const isLongContext = Prisma.sql`CASE
      WHEN (r."model" LIKE 'gpt-5.6%' OR r."model" = 'gpt-5.5') AND ${effectiveInput} > 272000 THEN TRUE
      WHEN r."model" = 'grok-4.6' AND ${effectiveInput} >= 200000 THEN TRUE
      ELSE FALSE
    END`;
    const timeZone = process.env.TZ?.trim() || "UTC";

    interface AggregateRow {
      groupKey: string;
      apiKeyId: string;
      userId: string | null;
      keyName: string | null;
      username: string | null;
      model: string;
      failed: boolean;
      requests: bigint;
      totalTokens: bigint;
      inputTokens: bigint;
      outputTokens: bigint;
      reasoningTokens: bigint;
      cachedTokens: bigint;
      uncachedInputTokens: bigint;
      cacheWriteTokens: bigint;
      longContext: boolean;
      serviceTier: string;
    }
    interface DailyRow {
      date: string;
      requests: bigint;
      tokens: bigint;
      inputTokens: bigint;
      outputTokens: bigint;
      success: bigint;
      failure: bigint;
    }
    interface EventRow {
      timestamp: Date;
      authIndex: string;
      keyName: string | null;
      username: string | null;
      model: string;
      latencyMs: number;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      failed: boolean;
    }
    interface LatencySummaryRow {
      sampleCount: bigint;
      averageMs: number | string | null;
      p95Ms: number | null;
      maxMs: number | null;
    }

    const [aggregateRows, dailyRows, eventRows, latencyRows, latencySeriesRows, collectorState] = await Promise.all([
      prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT r."apiKeyId" AS "groupKey",
               r."apiKeyId", r."userId", k."name" AS "keyName", u."username",
               r."model", r."failed", COUNT(*) AS requests,
               SUM(r."totalTokens") AS "totalTokens",
               SUM(${effectiveInput}) AS "inputTokens",
               SUM(${effectiveOutput}) AS "outputTokens",
               SUM(r."reasoningTokens") AS "reasoningTokens",
               SUM(${effectiveCached}) AS "cachedTokens",
               SUM(${effectiveUncached}) AS "uncachedInputTokens",
               SUM(${effectiveCacheWrite}) AS "cacheWriteTokens",
               ${isLongContext} AS "longContext",
               ${effectiveServiceTier} AS "serviceTier"
        FROM "usage_records" r
        LEFT JOIN "user_api_keys" k ON k."id" = r."apiKeyId"
        LEFT JOIN "users" u ON u."id" = r."userId"
        ${whereSql}
        GROUP BY r."apiKeyId", r."userId", k."name", u."username", r."model", r."failed",
                 ${isLongContext}, ${effectiveServiceTier}
      `),
      prisma.$queryRaw<DailyRow[]>(Prisma.sql`
        SELECT to_char((r."timestamp" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS date,
               COUNT(*) AS requests,
               SUM(r."totalTokens") AS tokens,
               SUM(${effectiveInput}) AS "inputTokens",
               SUM(${effectiveOutput}) AS "outputTokens",
               COUNT(*) FILTER (WHERE NOT r."failed") AS success,
               COUNT(*) FILTER (WHERE r."failed") AS failure
        FROM "usage_records" r
        ${whereSql}
        GROUP BY date
        ORDER BY date
      `),
      prisma.$queryRaw<EventRow[]>(Prisma.sql`
        SELECT r."timestamp", r."authIndex", k."name" AS "keyName", u."username", r."model",
               r."latencyMs", r."totalTokens",
               ${effectiveInput} AS "inputTokens",
               ${effectiveOutput} AS "outputTokens",
               r."failed"
        FROM "usage_records" r
        LEFT JOIN "user_api_keys" k ON k."id" = r."apiKeyId"
        LEFT JOIN "users" u ON u."id" = r."userId"
        ${whereSql}
        ORDER BY r."timestamp" DESC
        LIMIT ${REQUEST_EVENT_LIMIT}
      `),
      prisma.$queryRaw<LatencySummaryRow[]>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE r."latencyMs" > 0) AS "sampleCount",
               ROUND(AVG(r."latencyMs") FILTER (WHERE r."latencyMs" > 0)) AS "averageMs",
               percentile_disc(0.95) WITHIN GROUP (ORDER BY r."latencyMs") FILTER (WHERE r."latencyMs" > 0) AS "p95Ms",
               MAX(r."latencyMs") FILTER (WHERE r."latencyMs" > 0) AS "maxMs"
        FROM "usage_records" r
        ${whereSql}
      `),
      prisma.$queryRaw<EventRow[]>(Prisma.sql`
        SELECT r."timestamp", r."authIndex", k."name" AS "keyName", u."username", r."model",
               r."latencyMs", r."totalTokens",
               ${effectiveInput} AS "inputTokens",
               ${effectiveOutput} AS "outputTokens",
               r."failed"
        FROM "usage_records" r
        LEFT JOIN "user_api_keys" k ON k."id" = r."apiKeyId"
        LEFT JOIN "users" u ON u."id" = r."userId"
        ${whereSql}
          AND r."latencyMs" > 0
        ORDER BY r."timestamp" DESC
        LIMIT ${LATENCY_SERIES_LIMIT}
      `),
      prisma.collectorState.findUnique({ where: { id: "singleton" } }),
    ]);

    const keyUsageMap: Record<string, KeyUsage> = {};
    const modelTotalsMap: Record<string, { requests: number; tokens: number }> = {};
    let totalRequests = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalSuccessCount = 0;
    let totalFailureCount = 0;

    for (const record of aggregateRows) {
      const groupKey = record.groupKey;

      if (!keyUsageMap[groupKey]) {
        const keyName = record.keyName ?? record.username ?? `Key ${groupKey.slice(0, 6)}`;

        keyUsageMap[groupKey] = {
          keyName,
          ...(isAdmin && record.username ? { username: record.username } : {}),
          ...(isAdmin && record.userId ? { userId: record.userId } : {}),
          totalRequests: 0,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cachedTokens: 0,
          successCount: 0,
          failureCount: 0,
          models: {},
        };
      }

      const keyUsage = keyUsageMap[groupKey];
      const requests = dbNumber(record.requests);
      const tokens = dbNumber(record.totalTokens);
      keyUsage.totalRequests += requests;
      keyUsage.totalTokens += tokens;
      keyUsage.inputTokens += dbNumber(record.inputTokens);
      keyUsage.outputTokens += dbNumber(record.outputTokens);
      keyUsage.reasoningTokens += dbNumber(record.reasoningTokens);
      keyUsage.cachedTokens += dbNumber(record.cachedTokens);

      if (record.failed) {
        keyUsage.failureCount += requests;
      } else {
        keyUsage.successCount += requests;
      }

      const modelName = record.model;
      if (!keyUsage.models[modelName]) {
        keyUsage.models[modelName] = {
          totalRequests: 0,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          pricingBuckets: [],
        };
      }
      keyUsage.models[modelName].totalRequests += requests;
      keyUsage.models[modelName].totalTokens += tokens;
      keyUsage.models[modelName].inputTokens += dbNumber(record.inputTokens);
      keyUsage.models[modelName].outputTokens += dbNumber(record.outputTokens);
      const pricingBuckets = keyUsage.models[modelName].pricingBuckets;
      let pricingBucket = pricingBuckets.find((bucket) =>
        bucket.longContext === record.longContext && bucket.serviceTier === record.serviceTier
      );
      if (!pricingBucket) {
        pricingBucket = {
          requests: 0,
          inputTokens: 0,
          uncachedInputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
          longContext: record.longContext,
          serviceTier: record.serviceTier,
        };
        pricingBuckets.push(pricingBucket);
      }
      pricingBucket.requests += requests;
      pricingBucket.inputTokens += dbNumber(record.inputTokens);
      pricingBucket.uncachedInputTokens += dbNumber(record.uncachedInputTokens);
      pricingBucket.cacheReadTokens += dbNumber(record.cachedTokens);
      pricingBucket.cacheWriteTokens += dbNumber(record.cacheWriteTokens);
      pricingBucket.outputTokens += dbNumber(record.outputTokens);

      // Model totals aggregation for charts
      if (!modelTotalsMap[modelName]) {
        modelTotalsMap[modelName] = { requests: 0, tokens: 0 };
      }
      modelTotalsMap[modelName].requests += requests;
      modelTotalsMap[modelName].tokens += tokens;

      totalRequests += requests;
      totalTokens += tokens;
      totalInputTokens += dbNumber(record.inputTokens);
      totalOutputTokens += dbNumber(record.outputTokens);
      if (record.failed) {
        totalFailureCount += requests;
      } else {
        totalSuccessCount += requests;
      }
    }

    const dailyBreakdown = dailyRows.map((row) => ({
      date: row.date,
      requests: dbNumber(row.requests),
      tokens: dbNumber(row.tokens),
      inputTokens: dbNumber(row.inputTokens),
      outputTokens: dbNumber(row.outputTokens),
      success: dbNumber(row.success),
      failure: dbNumber(row.failure),
    }));

    // Build sorted model breakdown array (top models first)
    const modelBreakdown = Object.entries(modelTotalsMap)
      .sort(([, a], [, b]) => b.requests - a.requests)
      .map(([model, data]) => ({ model, ...data }));
    const requestEvents: RequestEvent[] = eventRows.map((row) => ({
      timestamp: row.timestamp.toISOString(),
      keyName: row.keyName ?? `Key ${row.authIndex.slice(0, 6)}`,
      ...(isAdmin && row.username ? { username: row.username } : {}),
      model: row.model,
      latencyMs: Math.max(0, row.latencyMs),
      totalTokens: row.totalTokens,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      failed: row.failed,
    }));
    const latencySeries: LatencyPoint[] = latencySeriesRows.map((row) => ({
      timestamp: row.timestamp.toISOString(),
      keyName: row.keyName ?? `Key ${row.authIndex.slice(0, 6)}`,
      ...(isAdmin && row.username ? { username: row.username } : {}),
      model: row.model,
      latencyMs: Math.max(0, row.latencyMs),
      failed: row.failed,
    })).reverse();
    const latencyRow = latencyRows[0];
    const latencySummary: LatencySummary = {
      sampleCount: dbNumber(latencyRow?.sampleCount),
      averageMs: dbNumber(latencyRow?.averageMs),
      p95Ms: dbNumber(latencyRow?.p95Ms),
      maxMs: dbNumber(latencyRow?.maxMs),
    };

    const responseData = {
      data: {
        keys: keyUsageMap,
        totals: {
          totalRequests,
          totalTokens,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          successCount: totalSuccessCount,
          failureCount: totalFailureCount,
        },
        dailyBreakdown,
        modelBreakdown,
        requestEvents,
        latencySeries,
        latencySummary,
        period: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
        collectorStatus: {
          lastCollectedAt: collectorState?.lastCollectedAt?.toISOString() ?? "",
          lastStatus: collectorState?.lastStatus ?? "unknown",
        },
        truncated: false,
      },
      isAdmin,
    };

    usageCache.set(cacheKey, responseData, USAGE_HISTORY_CACHE_TTL_MS);
    logger.info(
      {
        userId: session.userId,
        isAdmin,
        from: fromParam,
        to: toParam,
        recordCount: totalRequests,
        aggregateRows: aggregateRows.length,
        eventCount: requestEvents.length,
        truncated: false,
        durationMs: Date.now() - requestStartedAt,
      },
      "Usage history request completed"
    );

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error({ err: error, userId: session.userId, durationMs: Date.now() - requestStartedAt }, "Failed to fetch usage history");
    return Errors.internal("Failed to fetch usage history");
  }
}
