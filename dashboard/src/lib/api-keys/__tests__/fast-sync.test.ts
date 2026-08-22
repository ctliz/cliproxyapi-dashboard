import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";

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
  },
}));

describe("syncApiKeyFastPolicyFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes enabled API key names with irreversible token hashes", async () => {
    findManyMock.mockResolvedValue([
      { name: "dlb", key: "sk-fast-dlb" },
      { name: "cxf", key: "sk-fast-cxf" },
    ]);

    const { syncApiKeyFastPolicyFile } = await import("../fast-sync");
    const fs = (await import("fs/promises")).default;
    const result = await syncApiKeyFastPolicyFile();

    expect(result).toMatchObject({ ok: true, rulesCount: 2 });
    const content = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0]![1] as string);
    expect(content).toEqual({
      rules: [
        {
          api_key_name: "dlb",
          token_sha256: crypto.createHash("sha256").update("sk-fast-dlb").digest("hex"),
        },
        {
          api_key_name: "cxf",
          token_sha256: crypto.createHash("sha256").update("sk-fast-cxf").digest("hex"),
        },
      ],
    });
  });
});
