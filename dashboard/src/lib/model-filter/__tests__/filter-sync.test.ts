import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    modelPreference: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

describe("Global Model Filter Sync", () => {
  let tempDir: string;
  let filterFilePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "global-filter-test-"));
    filterFilePath = path.join(tempDir, "global-model-filter.json");
    process.env.CLIPROXYAPI_GLOBAL_MODEL_FILTER = filterFilePath;
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
    delete process.env.CLIPROXYAPI_GLOBAL_MODEL_FILTER;
  });

  it("maps excluded models to correct OAuth provider buckets", async () => {
    const { mapExcludedModelsToOAuthProviders } = await import("../filter-sync");

    const mapped = mapExcludedModelsToOAuthProviders(
      [
        "claude-opus-4-8",
        "claude-fable-5",
        "gpt-5.6-terra",
        "codex-auto-review",
        "gemini-3.7-flash-tiered",
        "grok-3",
        "kimi-k2",
      ],
      {
        "gpt-5.6-terra": "openai",
        "claude-opus-4-8": "anthropic",
      }
    );

    expect(mapped.claude).toContain("claude-opus-4-8");
    expect(mapped.claude).toContain("claude-fable-5");
    expect(mapped.codex).toContain("gpt-5.6-terra");
    expect(mapped.codex).toContain("codex-auto-review");
    expect(mapped.antigravity).toContain("gemini-3.7-flash-tiered");
    expect(mapped.xai).toContain("grok-3");
    expect(mapped.kimi).toContain("kimi-k2");
  });

  it("writes active global excluded models to JSON file when models are excluded", async () => {
    mockFindUnique.mockResolvedValue({
      excludedModels: ["gpt-3.5-turbo*", "claude-opus-4-8", "gemini-3.7-flash-tiered"],
    });

    const { syncGlobalModelFilter } = await import("../filter-sync");
    const result = await syncGlobalModelFilter("user-1");

    expect(result.ok).toBe(true);
    expect(result.excludedCount).toBe(3);

    const rawContent = await fs.readFile(filterFilePath, "utf8");
    const parsed = JSON.parse(rawContent);

    expect(parsed.enabled).toBe(true);
    expect(parsed.global_excluded_models).toEqual([
      "gpt-3.5-turbo*",
      "claude-opus-4-8",
      "gemini-3.7-flash-tiered",
    ]);
    expect(parsed.action).toBe("reject");
  });

  it("disables filter when no models are excluded", async () => {
    mockFindUnique.mockResolvedValue({
      excludedModels: [],
    });

    const { syncGlobalModelFilter } = await import("../filter-sync");
    const result = await syncGlobalModelFilter("user-1");

    expect(result.ok).toBe(true);
    expect(result.excludedCount).toBe(0);

    const rawContent = await fs.readFile(filterFilePath, "utf8");
    const parsed = JSON.parse(rawContent);

    expect(parsed.enabled).toBe(false);
    expect(parsed.global_excluded_models).toEqual([]);
  });
});
