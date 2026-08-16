import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { computeTokenSha256 } from "../policy-sync";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const findManyMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    userApiKey: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

vi.mock("fs/promises", () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('{"rules":[]}'),
  },
}));

describe("computeTokenSha256", () => {
  it("computes lowercase sha256 hex correctly", () => {
    const token = "sk-test-123456";
    const expected = crypto.createHash("sha256").update(token).digest("hex");
    expect(computeTokenSha256(token)).toBe(expected);
  });

  it("strips Bearer prefix and whitespace", () => {
    const raw = "Bearer sk-test-123456  ";
    const expected = crypto.createHash("sha256").update("sk-test-123456").digest("hex");
    expect(computeTokenSha256(raw)).toBe(expected);
  });
});

describe("syncTokenModelPolicyFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes formatted rules to policy file", async () => {
    const { syncTokenModelPolicyFile } = await import("../policy-sync");
    const fs = (await import("fs/promises")).default;

    findManyMock.mockResolvedValue([
      {
        key: "sk-my-secret-key",
        allowedModels: ["gpt-4o", "claude-*"],
        fallbackProvider: "antigravity",
        fallbackModel: "gemini-2.5-flash",
      },
    ]);

    const res = await syncTokenModelPolicyFile();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.rulesCount).toBe(1);
    }

    expect(fs.mkdir).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalled();

    const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
    expect(writeCall).toBeDefined();
    const writtenContent = JSON.parse(writeCall![1] as string);

    const expectedHash = crypto.createHash("sha256").update("sk-my-secret-key").digest("hex");
    expect(writtenContent).toEqual({
      rules: [
        {
          token_sha256: expectedHash,
          allowed_models: ["gpt-4o", "claude-*"],
          fallback: {
            provider: "antigravity",
            model: "gemini-2.5-flash",
          },
        },
      ],
    });
  });

  it("omits fallback when not fully specified", async () => {
    const { syncTokenModelPolicyFile } = await import("../policy-sync");
    const fs = (await import("fs/promises")).default;

    findManyMock.mockResolvedValue([
      {
        key: "sk-another-key",
        allowedModels: ["gpt-4o"],
        fallbackProvider: "",
        fallbackModel: null,
      },
    ]);

    const res = await syncTokenModelPolicyFile();
    expect(res.ok).toBe(true);

    const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
    expect(writeCall).toBeDefined();
    const writtenContent = JSON.parse(writeCall![1] as string);

    expect(writtenContent.rules[0].fallback).toBeUndefined();
    expect(writtenContent.rules[0].allowed_models).toEqual(["gpt-4o"]);
  });
});
