import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import zhCN from "../../../messages/zh-CN.json";
import de from "../../../messages/de.json";
import es from "../../../messages/es.json";

function flattenMessages(
  value: Record<string, unknown>,
  prefix = "",
): Map<string, string> {
  const messages = new Map<string, string>();

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") messages.set(path, child);
    else messages.set(path, "__namespace__");

    if (child && typeof child === "object" && !Array.isArray(child)) {
      for (const [nestedPath, message] of flattenMessages(
        child as Record<string, unknown>,
        path,
      )) {
        messages.set(nestedPath, message);
      }
    }
  }

  return messages;
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\b/g)]
    .map((match) => match[1]!)
    .sort();
}

describe("Translation messages parity with English", () => {
  const english = flattenMessages(en);

  describe("Simplified Chinese (zh-CN)", () => {
    const chinese = flattenMessages(zhCN);

    it("matches the complete English message structure", () => {
      expect([...chinese.keys()].sort()).toEqual([...english.keys()].sort());
    });

    it("preserves every interpolation placeholder", () => {
      for (const [path, englishMessage] of english) {
        if (englishMessage === "__namespace__") continue;
        expect(placeholders(chinese.get(path) ?? ""), path).toEqual(
          placeholders(englishMessage),
        );
      }
    });
  });

  describe("German (de)", () => {
    const german = flattenMessages(de);

    it("matches the complete English message structure", () => {
      expect([...german.keys()].sort()).toEqual([...english.keys()].sort());
    });

    it("preserves every interpolation placeholder", () => {
      for (const [path, englishMessage] of english) {
        if (englishMessage === "__namespace__") continue;
        expect(placeholders(german.get(path) ?? ""), path).toEqual(
          placeholders(englishMessage),
        );
      }
    });
  });

  describe("Spanish (es)", () => {
    const spanish = flattenMessages(es);

    it("matches the complete English message structure", () => {
      expect([...spanish.keys()].sort()).toEqual([...english.keys()].sort());
    });

    it("preserves every interpolation placeholder", () => {
      for (const [path, englishMessage] of english) {
        if (englishMessage === "__namespace__") continue;
        expect(placeholders(spanish.get(path) ?? ""), path).toEqual(
          placeholders(englishMessage),
        );
      }
    });
  });
});

