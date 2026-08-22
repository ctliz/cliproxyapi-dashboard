import { describe, expect, it, vi } from "vitest";

import { isShortTermQuotaWindow } from "../quota-window-classification";

describe("isShortTermQuotaWindow", () => {
  it("keeps explicit short-term markers classified as short-term", () => {
    expect(
      isShortTermQuotaWindow({
        id: "five-hour",
        label: "5h Session",
        resetTime: "2026-04-06T06:00:00.000Z",
      })
    ).toBe(true);
  });

  it("uses explicit provider window types", () => {
    expect(
      isShortTermQuotaWindow({
        id: "gemini-5h",
        label: "Gemini Models - Five Hour Limit Remaining",
        resetTime: "2026-04-06T01:53:55.000Z",
        windowType: "five-hour",
      })
    ).toBe(true);
    expect(
      isShortTermQuotaWindow({
        id: "gemini-weekly",
        label: "Gemini Models - Weekly Limit Remaining",
        resetTime: "2026-04-06T01:53:55.000Z",
        windowType: "weekly",
      })
    ).toBe(false);
  });

  it("does not infer a weekly window is short-term from a nearby reset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T20:54:00.000Z"));

    expect(
      isShortTermQuotaWindow({
        id: "primary-window",
        label: "168h Window",
        resetTime: "2026-04-06T01:53:55.000Z",
      })
    ).toBe(false);

    vi.useRealTimers();
  });

  it("treats windows without markers or reset time as long-term", () => {
    expect(
      isShortTermQuotaWindow({
        id: "gemini-3-pro",
        label: "Gemini 3 Pro",
        resetTime: null,
      })
    ).toBe(false);
  });
});
