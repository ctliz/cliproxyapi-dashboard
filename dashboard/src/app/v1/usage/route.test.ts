import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session", () => ({
  verifySession: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userApiKey: { findUnique: vi.fn() },
    usageRecord: { groupBy: vi.fn() },
    collectorState: { findUnique: vi.fn() },
  },
}));

const groupBy = vi.mocked(prisma.usageRecord.groupBy);
const findApiKey = vi.mocked(prisma.userApiKey.findUnique);
const verify = vi.mocked(verifySession);

function request(path = "/v1/usage", headers?: HeadersInit) {
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("GET /v1/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.collectorState.findUnique).mockResolvedValue({
      id: "singleton",
      lastCollectedAt: new Date("2026-08-20T02:00:00.000Z"),
      lastStatus: "success",
      recordsStored: 10,
      errorMessage: null,
      updatedAt: new Date("2026-08-20T02:00:00.000Z"),
    } as never);
  });

  it("rejects requests without a session or API key", async () => {
    verify.mockResolvedValue(null);
    findApiKey.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET(request());

    expect(response.status).toBe(401);
  });

  it("returns all model usage for an administrator session", async () => {
    verify.mockResolvedValue({ userId: "admin-1", username: "admin", sessionVersion: 0 });
    groupBy.mockResolvedValue([
      {
        model: "gpt-5.6-sol",
        failed: false,
        _count: { _all: 2 },
        _sum: {
          inputTokens: 1_000,
          cachedTokens: 900,
          outputTokens: 100,
          reasoningTokens: 50,
          totalTokens: 1_100,
        },
        _avg: { latencyMs: 500 },
        _min: { timestamp: new Date("2026-08-20T00:00:00.000Z") },
        _max: { timestamp: new Date("2026-08-20T01:00:00.000Z") },
      },
      {
        model: "gpt-5.6-sol",
        failed: true,
        _count: { _all: 1 },
        _sum: {
          inputTokens: 0,
          cachedTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
        },
        _avg: { latencyMs: 1_000 },
        _min: { timestamp: new Date("2026-08-20T01:30:00.000Z") },
        _max: { timestamp: new Date("2026-08-20T01:30:00.000Z") },
      },
    ] as never);

    const { GET } = await import("./route");
    const response = await GET(request("/v1/usage?from=2026-08-20&to=2026-08-20"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scope).toBe("all");
    expect(body.totals.requests).toBe(3);
    expect(body.data[0]).toMatchObject({
      model: "gpt-5.6-sol",
      requests: 3,
      successful_requests: 2,
      failed_requests: 1,
      cache_hit_rate: 0.9,
    });
  });

  it("returns all usage to a request with a valid API key", async () => {
    verify.mockResolvedValue(null);
    findApiKey.mockResolvedValue({
      userId: "user-1",
    } as never);
    groupBy.mockResolvedValue([] as never);

    const { GET } = await import("./route");
    const response = await GET(request("/v1/usage", { Authorization: "Bearer sk-test" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scope).toBe("all");
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
    }));
  });

  it("uses canonical v2 token buckets for cache rate and totals", async () => {
    verify.mockResolvedValue({ userId: "admin-1", username: "admin", sessionVersion: 0 });
    groupBy.mockResolvedValue([{
      model: "claude-opus-5",
      failed: false,
      accountingVersion: 2,
      _count: { _all: 1 },
      _sum: {
        inputTokens: 10,
        inputTotalTokens: 100,
        uncachedInputTokens: 10,
        cachedTokens: 80,
        cacheReadTokens: 80,
        cacheWriteTokens: 10,
        outputTokens: 7,
        outputTotalTokens: 7,
        nonReasoningOutputTokens: 5,
        reasoningTokens: 2,
        unclassifiedTokens: 0,
        totalTokens: 107,
      },
      _avg: { latencyMs: 250 },
      _min: { timestamp: new Date("2026-08-20T00:00:00.000Z") },
      _max: { timestamp: new Date("2026-08-20T00:00:01.000Z") },
    }] as never);

    const { GET } = await import("./route");
    const response = await GET(request());
    const body = await response.json();

    expect(body.data[0]).toMatchObject({
      input_tokens: 100,
      uncached_input_tokens: 10,
      cache_read_tokens: 80,
      cache_write_tokens: 10,
      output_tokens: 7,
      non_reasoning_output_tokens: 5,
      reasoning_tokens: 2,
      total_tokens: 107,
      cache_hit_rate: 0.8,
      cache_hit_rate_quality: "complete",
      v2_requests: 1,
      legacy_requests: 0,
    });
  });

  it("rejects an invalid date range", async () => {
    verify.mockResolvedValue({ userId: "admin-1", username: "admin", sessionVersion: 0 });

    const { GET } = await import("./route");
    const response = await GET(request("/v1/usage?from=2026-08-21&to=2026-08-20"));

    expect(response.status).toBe(400);
  });

  it("rejects a date that does not exist", async () => {
    verify.mockResolvedValue({ userId: "admin-1", username: "admin", sessionVersion: 0 });

    const { GET } = await import("./route");
    const response = await GET(request("/v1/usage?from=2026-02-31"));

    expect(response.status).toBe(400);
  });
});
