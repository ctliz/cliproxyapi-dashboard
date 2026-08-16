import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://mock:mock@localhost:5432/mock",
    JWT_SECRET: "mock-jwt-secret-at-least-32-characters-long",
    MANAGEMENT_API_KEY: "mock-management-key",
    CLIPROXYAPI_MANAGEMENT_URL: "http://localhost:8317/v0/management",
    ALLOW_LOCAL_PROVIDER_URLS: false,
    LOG_LEVEL: "info",
    NODE_ENV: "test",
  },
}));

vi.mock("@/lib/auth/session", () => ({
  verifySession: vi.fn(() => Promise.resolve({ userId: "user-1", username: "alice" })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userApiKey: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    customProvider: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    modelPreference: {
      findUnique: vi.fn().mockResolvedValue({ excludedModels: ["hidden-model"] }),
    },
  },
}));

vi.mock("@/lib/config-generators/shared", () => ({
  buildAvailableModelIds: vi.fn((proxyModels: unknown[], oauthAliasIds: string[]) => [
    ...oauthAliasIds,
  ]),
  fetchProxyModels: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/config-generators/opencode", () => ({
  getInternalProxyUrl: vi.fn(() => "http://localhost:8317"),
  extractOAuthModelAliases: vi.fn(() => ({})),
}));

describe("GET /api/proxy/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns available models and providers", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models).toContain("hidden-model");
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers.some((p: { id: string }) => p.id === "antigravity")).toBe(true);
  });
});
