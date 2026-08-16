import { describe, expect, it } from "vitest";
import { canonicalizeOAuthProvider, OAUTH_PROVIDER } from "../constants";

describe("canonicalizeOAuthProvider", () => {
  it("recognizes xai auth files", () => {
    expect(canonicalizeOAuthProvider("xai")).toBe(OAUTH_PROVIDER.XAI);
  });
});
