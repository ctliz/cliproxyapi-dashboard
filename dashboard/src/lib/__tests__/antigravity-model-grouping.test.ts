import { describe, expect, it } from "vitest";
import {
  categorizeAntigravityModel,
  groupAntigravityModels,
  type AntigravityModel,
} from "@/lib/antigravity-model-grouping";

function quotaModel(displayName?: string): AntigravityModel {
  return {
    displayName,
    quotaInfo: {
      remainingFraction: 0.75,
      resetTime: "2026-08-04T06:21:25Z",
    },
  };
}

describe("Antigravity model grouping", () => {
  it("recognizes current Gemini families from IDs and display names", () => {
    expect(categorizeAntigravityModel("gemini-3.6-flash-tiered")).toBe("Gemini 3.6 Flash");
    expect(categorizeAntigravityModel("gemini-pro-agent", "Gemini 3.1 Pro (High)")).toBe(
      "Gemini 3.1 Pro"
    );
    expect(categorizeAntigravityModel("gemini-3-flash-agent", "Gemini 3.5 Flash (High)")).toBe(
      "Gemini 3.5 Flash"
    );
    expect(categorizeAntigravityModel("gemini-2.5-flash", "Gemini 3.1 Flash Lite")).toBe(
      "Gemini 3.1 Flash"
    );
  });

  it("keeps opaque chat and tab models out of Other", () => {
    expect(categorizeAntigravityModel("chat_20706")).toBe("Chat");
    expect(categorizeAntigravityModel("tab_flash_lite_preview")).toBe("Tab Completion");
  });

  it("groups the current Antigravity catalog without collapsing known models into Other", () => {
    const groups = groupAntigravityModels({
      "claude-opus-4-6-thinking": quotaModel("Claude Opus 4.6 (Thinking)"),
      "gpt-oss-120b-medium": quotaModel("GPT-OSS 120B (Medium)"),
      "gemini-2.5-flash": quotaModel("Gemini 3.1 Flash Lite"),
      "gemini-3.1-flash-image": quotaModel("Gemini 3.1 Flash Image"),
      "gemini-3.1-pro-high": quotaModel("Gemini 3.1 Pro (High)"),
      "gemini-3.5-flash-low": quotaModel("Gemini 3.5 Flash (Medium)"),
      "gemini-3.6-flash-tiered": quotaModel(),
      "chat_20706": quotaModel(),
      "tab_flash_lite_preview": quotaModel(),
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Claude/GPT",
      "Gemini 3.6 Flash",
      "Gemini 3.5 Flash",
      "Gemini 3.1 Pro",
      "Gemini 3.1 Flash",
      "Chat",
      "Tab Completion",
    ]);
    expect(groups.find((group) => group.label === "Gemini 3.1 Flash")?.models).toHaveLength(2);
    expect(groups.find((group) => group.label === "Other")).toBeUndefined();
  });

  it("creates a versioned family for future Gemini releases", () => {
    expect(categorizeAntigravityModel("gemini-4.2-pro-high")).toBe("Gemini 4.2 Pro");
  });
});

