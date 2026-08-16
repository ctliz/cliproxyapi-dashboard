import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockSession = { userId: "user-1", username: "alice", sessionVersion: 0 };
vi.mock("@/lib/auth/session", () => ({
  verifySession: vi.fn(() => Promise.resolve(mockSession)),
}));

vi.mock("@/lib/auth/origin", () => ({
  validateOrigin: vi.fn(() => null),
}));

const findFirstMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    userApiKey: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

const syncPolicyMock = vi.fn();
vi.mock("@/lib/api-keys/policy-sync", () => ({
  syncTokenModelPolicyFile: (...args: unknown[]) => syncPolicyMock(...args),
}));

function buildPutRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/user/api-keys/key-123/policy", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/user/api-keys/[id]/policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncPolicyMock.mockResolvedValue({ ok: true, rulesCount: 1, filePath: "/path" });
  });

  it("updates policy and syncs file when valid input is provided", async () => {
    findFirstMock.mockResolvedValue({ id: "key-123", userId: "user-1" });
    updateMock.mockResolvedValue({
      id: "key-123",
      name: "Default",
      policyEnabled: true,
      allowedModels: ["gpt-4o", "claude-*"],
      fallbackProvider: "antigravity",
      fallbackModel: "gemini-2.5-flash",
    });

    const { PUT } = await import("./route");
    const res = await PUT(
      buildPutRequest({
        policyEnabled: true,
        allowedModels: ["gpt-4o", "claude-*"],
        fallbackProvider: "antigravity",
        fallbackModel: "gemini-2.5-flash",
      }),
      { params: Promise.resolve({ id: "key-123" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.apiKey.policyEnabled).toBe(true);
    expect(body.apiKey.allowedModels).toEqual(["gpt-4o", "claude-*"]);
    expect(syncPolicyMock).toHaveBeenCalledTimes(1);
  });

  it("returns 404 if API key does not belong to session user", async () => {
    findFirstMock.mockResolvedValue(null);

    const { PUT } = await import("./route");
    const res = await PUT(
      buildPutRequest({
        policyEnabled: true,
        allowedModels: ["gpt-4o"],
      }),
      { params: Promise.resolve({ id: "non-existent" }) }
    );

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when validation fails", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(
      buildPutRequest({
        policyEnabled: "not-a-boolean",
      }),
      { params: Promise.resolve({ id: "key-123" }) }
    );

    expect(res.status).toBe(400);
  });
});
