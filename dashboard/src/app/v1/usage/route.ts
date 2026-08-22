import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

type Viewer =
  | {
      authType: "session";
      userId: string;
    }
  | {
      authType: "api_key";
      userId: string;
    };

interface ModelUsageSummary {
  model: string;
  requests: number;
  successful_requests: number;
  failed_requests: number;
  input_tokens: number;
  uncached_input_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  non_reasoning_output_tokens: number;
  reasoning_tokens: number;
  unclassified_tokens: number;
  total_tokens: number;
  v2_requests: number;
  legacy_requests: number;
  accounted_input_tokens: number;
  accounted_cache_read_tokens: number;
  cache_hit_rate: number;
  cache_hit_rate_quality: "complete" | "partial" | "legacy";
  average_latency_ms: number;
  first_request_at: string | null;
  last_request_at: string | null;
}

function parseDateBound(value: string | null, endOfDay: boolean): Date | null | "invalid" {
  if (value === null) return null;

  let date: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number) as [number, number, number];
    const candidate = new Date(year, month - 1, day);
    if (
      candidate.getFullYear() !== year
      || candidate.getMonth() !== month - 1
      || candidate.getDate() !== day
    ) {
      return "invalid";
    }
    date = endOfDay
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : candidate;
  } else {
    date = new Date(value);
  }

  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

function extractBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function resolveViewer(request: NextRequest): Promise<Viewer | null> {
  const session = await verifySession();
  if (session) {
    return {
      authType: "session",
      userId: session.userId,
    };
  }

  const token = extractBearerToken(request);
  if (!token) return null;

  const apiKey = await prisma.userApiKey.findUnique({
    where: { key: token },
    select: {
      userId: true,
    },
  });

  if (!apiKey) return null;
  return {
    authType: "api_key",
    userId: apiKey.userId,
  };
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const viewer = await resolveViewer(request);
  if (!viewer) return Errors.unauthorized();

  const from = parseDateBound(request.nextUrl.searchParams.get("from"), false);
  const to = parseDateBound(request.nextUrl.searchParams.get("to"), true);

  if (from === "invalid" || to === "invalid") {
    return Errors.validation("Invalid date. Use YYYY-MM-DD or an ISO 8601 timestamp.");
  }
  if (from && to && from > to) {
    return Errors.validation("from must be before to");
  }

  try {
    const timestamp = from || to
      ? {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
      }
      : undefined;

    const [groups, collectorState] = await Promise.all([
      prisma.usageRecord.groupBy({
        by: ["model", "failed", "accountingVersion"],
        where: {
          ...(timestamp ? { timestamp } : {}),
        },
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          inputTotalTokens: true,
          uncachedInputTokens: true,
          cachedTokens: true,
          cacheReadTokens: true,
          cacheWriteTokens: true,
          outputTokens: true,
          outputTotalTokens: true,
          nonReasoningOutputTokens: true,
          reasoningTokens: true,
          unclassifiedTokens: true,
          totalTokens: true,
        },
        _avg: { latencyMs: true },
        _min: { timestamp: true },
        _max: { timestamp: true },
      }),
      prisma.collectorState.findUnique({ where: { id: "singleton" } }),
    ]);

    const byModel = new Map<string, ModelUsageSummary>();
    for (const group of groups) {
      const current = byModel.get(group.model) ?? {
        model: group.model,
        requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        input_tokens: 0,
        uncached_input_tokens: 0,
        cached_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        output_tokens: 0,
        non_reasoning_output_tokens: 0,
        reasoning_tokens: 0,
        unclassified_tokens: 0,
        total_tokens: 0,
        v2_requests: 0,
        legacy_requests: 0,
        accounted_input_tokens: 0,
        accounted_cache_read_tokens: 0,
        cache_hit_rate: 0,
        cache_hit_rate_quality: "legacy",
        average_latency_ms: 0,
        first_request_at: null,
        last_request_at: null,
      };

      const requests = group._count._all;
      current.requests += requests;
      if (group.failed) {
        current.failed_requests += requests;
      } else {
        current.successful_requests += requests;
      }
      const isV2 = group.accountingVersion >= 2;
      const inputTokens = isV2
        ? group._sum.inputTotalTokens ?? 0
        : group._sum.inputTokens ?? 0;
      const cachedTokens = isV2
        ? group._sum.cacheReadTokens ?? 0
        : group._sum.cachedTokens ?? 0;
      const outputTokens = isV2
        ? group._sum.outputTotalTokens ?? 0
        : group._sum.outputTokens ?? 0;
      current.input_tokens += inputTokens;
      current.cached_tokens += cachedTokens;
      current.output_tokens += outputTokens;
      current.reasoning_tokens += group._sum.reasoningTokens ?? 0;
      current.total_tokens += group._sum.totalTokens ?? 0;
      if (isV2) {
        current.v2_requests += requests;
        current.accounted_input_tokens += inputTokens;
        current.accounted_cache_read_tokens += group._sum.cacheReadTokens ?? 0;
        current.uncached_input_tokens += group._sum.uncachedInputTokens ?? 0;
        current.cache_read_tokens += group._sum.cacheReadTokens ?? 0;
        current.cache_write_tokens += group._sum.cacheWriteTokens ?? 0;
        current.non_reasoning_output_tokens += group._sum.nonReasoningOutputTokens ?? 0;
        current.unclassified_tokens += group._sum.unclassifiedTokens ?? 0;
      } else {
        current.legacy_requests += requests;
      }

      const weightedLatency = current.average_latency_ms * (current.requests - requests);
      current.average_latency_ms = Math.round(
        (weightedLatency + (group._avg.latencyMs ?? 0) * requests) / current.requests
      );

      const first = group._min.timestamp?.toISOString() ?? null;
      const last = group._max.timestamp?.toISOString() ?? null;
      if (first && (!current.first_request_at || first < current.first_request_at)) {
        current.first_request_at = first;
      }
      if (last && (!current.last_request_at || last > current.last_request_at)) {
        current.last_request_at = last;
      }

      byModel.set(group.model, current);
    }

    const models = [...byModel.values()]
      .map((model) => ({
        ...model,
        cache_hit_rate: (model.v2_requests > 0 ? model.accounted_input_tokens : model.input_tokens) > 0
          ? Number(((model.v2_requests > 0 ? model.accounted_cache_read_tokens : model.cached_tokens)
            / (model.v2_requests > 0 ? model.accounted_input_tokens : model.input_tokens)).toFixed(4))
          : 0,
        cache_hit_rate_quality: model.v2_requests === 0
          ? "legacy" as const
          : model.legacy_requests > 0
            ? "partial" as const
            : "complete" as const,
      }))
      .sort((a, b) => b.total_tokens - a.total_tokens || b.requests - a.requests);

    const totals = models.reduce(
      (sum, model) => ({
        requests: sum.requests + model.requests,
        successful_requests: sum.successful_requests + model.successful_requests,
        failed_requests: sum.failed_requests + model.failed_requests,
        input_tokens: sum.input_tokens + model.input_tokens,
        uncached_input_tokens: sum.uncached_input_tokens + model.uncached_input_tokens,
        cached_tokens: sum.cached_tokens + model.cached_tokens,
        cache_read_tokens: sum.cache_read_tokens + model.cache_read_tokens,
        cache_write_tokens: sum.cache_write_tokens + model.cache_write_tokens,
        output_tokens: sum.output_tokens + model.output_tokens,
        non_reasoning_output_tokens: sum.non_reasoning_output_tokens + model.non_reasoning_output_tokens,
        reasoning_tokens: sum.reasoning_tokens + model.reasoning_tokens,
        unclassified_tokens: sum.unclassified_tokens + model.unclassified_tokens,
        total_tokens: sum.total_tokens + model.total_tokens,
        v2_requests: sum.v2_requests + model.v2_requests,
        legacy_requests: sum.legacy_requests + model.legacy_requests,
        accounted_input_tokens: sum.accounted_input_tokens + model.accounted_input_tokens,
        accounted_cache_read_tokens: sum.accounted_cache_read_tokens + model.accounted_cache_read_tokens,
      }),
      {
        requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        input_tokens: 0,
        uncached_input_tokens: 0,
        cached_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        output_tokens: 0,
        non_reasoning_output_tokens: 0,
        reasoning_tokens: 0,
        unclassified_tokens: 0,
        total_tokens: 0,
        v2_requests: 0,
        legacy_requests: 0,
        accounted_input_tokens: 0,
        accounted_cache_read_tokens: 0,
      }
    );

    const response = NextResponse.json({
      object: "usage.list",
      generated_at: new Date().toISOString(),
      scope: "all",
      period: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      totals: {
        ...totals,
        cache_hit_rate: (totals.v2_requests > 0 ? totals.accounted_input_tokens : totals.input_tokens) > 0
          ? Number(((totals.v2_requests > 0 ? totals.accounted_cache_read_tokens : totals.cached_tokens)
            / (totals.v2_requests > 0 ? totals.accounted_input_tokens : totals.input_tokens)).toFixed(4))
          : 0,
        cache_hit_rate_quality: totals.v2_requests === 0
          ? "legacy"
          : totals.legacy_requests > 0
            ? "partial"
            : "complete",
      },
      data: models,
      collector: {
        last_collected_at: collectorState?.lastCollectedAt?.toISOString() ?? null,
        status: collectorState?.lastStatus ?? "unknown",
      },
    });
    response.headers.set("Cache-Control", "private, no-store");

    logger.info(
      {
        userId: viewer.userId,
        authType: viewer.authType,
        modelCount: models.length,
        durationMs: Date.now() - startedAt,
      },
      "Model usage summary generated"
    );
    return response;
  } catch (error) {
    logger.error(
      { err: error, userId: viewer.userId, durationMs: Date.now() - startedAt },
      "Failed to generate model usage summary"
    );
    return Errors.internal("Failed to fetch model usage");
  }
}
