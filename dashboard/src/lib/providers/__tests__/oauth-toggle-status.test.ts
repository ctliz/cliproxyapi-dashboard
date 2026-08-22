import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    providerOAuthOwnership: {
      findUnique: hoisted.findUnique,
      findMany: hoisted.findMany,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/cache", () => ({
  invalidateUsageCaches: vi.fn(),
  invalidateProxyModelsCache: vi.fn(),
}));

vi.mock("@/lib/providers/management-api", () => ({
  fetchWithTimeout: hoisted.fetchWithTimeout,
  MANAGEMENT_BASE_URL: "http://stub/v0/management",
  MANAGEMENT_API_KEY: "stub-key",
  FETCH_TIMEOUT_MS: 5_000,
  isRecord: (value: unknown) =>
    typeof value === "object" && value !== null && !Array.isArray(value),
}));

vi.mock("@/lib/providers/oauth-import-normalization", () => ({
  normalizeImportedOAuthCredential: vi.fn(),
}));

import { toggleOAuthAccountByIdOrName } from "../oauth-ops";

describe("toggleOAuthAccountByIdOrName", () => {
  beforeEach(() => {
    hoisted.fetchWithTimeout.mockReset();
    hoisted.findUnique.mockReset();
    hoisted.findMany.mockReset();
  });

  it("uses the partial status endpoint without replacing the credential file", async () => {
    hoisted.findUnique.mockResolvedValue({
      id: "ownership-1",
      userId: "user-1",
      accountName: "codex-user.json",
    });
    hoisted.fetchWithTimeout.mockResolvedValue(new Response(null, { status: 200 }));

    const result = await toggleOAuthAccountByIdOrName(
      "user-1",
      "ownership-1",
      true,
      false,
    );

    expect(result).toEqual({ ok: true, disabled: true });
    expect(hoisted.fetchWithTimeout).toHaveBeenCalledWith(
      "http://stub/v0/management/auth-files/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "codex-user.json", disabled: true }),
      }),
    );
  });
});
