import { describe, expect, it } from "vitest";

import {
  clampEveryMinutes,
  DEFAULT_EVERY_MINUTES,
  formatLogLine,
  parseArgs,
  parseEnvFile,
  summariseCycle,
  tailLines,
} from "./launcher.mjs";

describe("clampEveryMinutes", () => {
  it("keeps a sane value", () => {
    expect(clampEveryMinutes(30)).toBe(30);
    expect(clampEveryMinutes("15")).toBe(15);
  });
  it("clamps out-of-range and falls back on junk", () => {
    expect(clampEveryMinutes(0)).toBe(1);
    expect(clampEveryMinutes(99999)).toBe(1440);
    expect(clampEveryMinutes("banana")).toBe(DEFAULT_EVERY_MINUTES);
    expect(clampEveryMinutes(undefined)).toBe(DEFAULT_EVERY_MINUTES);
  });
});

describe("parseArgs", () => {
  it("defaults to a 15-minute loop", () => {
    expect(parseArgs([])).toEqual({ mode: "loop", everyMinutes: 15 });
  });
  it("--once", () => {
    expect(parseArgs(["--once"])).toEqual({ mode: "once", everyMinutes: 15 });
  });
  it("--loop --every N (space or =)", () => {
    expect(parseArgs(["--loop", "--every", "30"])).toEqual({
      mode: "loop",
      everyMinutes: 30,
    });
    expect(parseArgs(["--every=60"])).toEqual({ mode: "loop", everyMinutes: 60 });
  });
  it("a bad --every value falls back to the default", () => {
    expect(parseArgs(["--loop", "--every", "nope"]).everyMinutes).toBe(15);
  });
});

describe("parseEnvFile", () => {
  it("reads KEY=value, ignores blanks and comments, strips quotes", () => {
    const env = parseEnvFile(
      [
        "# comment",
        "",
        "WAHA_URL=http://localhost:3000",
        'WAHA_API_KEY="abc123"',
        "SEND_DELAY_MS = 4000 ",
        "MALFORMED",
      ].join("\n"),
    );
    expect(env.WAHA_URL).toBe("http://localhost:3000");
    expect(env.WAHA_API_KEY).toBe("abc123");
    expect(env.SEND_DELAY_MS).toBe("4000");
    expect(env.MALFORMED).toBeUndefined();
  });
});

describe("summariseCycle", () => {
  it("nothing queued on either side", () => {
    const s = summariseCycle({
      remindersOut: "No reminders due.\n",
      promotionsOut: "No promotions sending.\n",
    });
    expect(s.remindersNoneDue).toBe(true);
    expect(s.promoNoneSending).toBe(true);
    expect(s.line).toBe("no reminders due · no promotions sending");
  });

  it("reads the reminder Done summary line", () => {
    const s = summariseCycle({
      remindersOut:
        "2 reminder(s) to send.\n  a → sent\n  b → failed (WAHA 500)\nDone. sent=1 failed=1 retrying=0\n",
      promotionsOut: "No promotions sending.\n",
    });
    expect(s.remindersSent).toBe(1);
    expect(s.remindersFailed).toBe(1);
    expect(s.line).toContain("reminders 1 sent, 1 failed");
  });

  it("counts promotion parts and surfaces the send-window notice", () => {
    const s = summariseCycle({
      remindersOut: "No reminders due.\n",
      promotionsOut:
        "1 promotion(s) sending.\n  +9199 text → sent\n  +9199 image → sent\n  +9188 text → skipped (not on WhatsApp)\n  promo p1: outside 09:00–20:00 Asia/Kolkata\n",
    });
    expect(s.promoPartsSent).toBe(2);
    expect(s.promoPartsSkipped).toBe(1);
    expect(s.promoOutsideWindow).toBe(true);
    expect(s.line).toContain("promo 2 sent");
    expect(s.line).toContain("outside send window");
  });

  it("flags an auto-pause", () => {
    const s = summariseCycle({
      remindersOut: "No reminders due.\n",
      promotionsOut:
        "1 promotion(s) sending.\n  +9199 text → failed (WAHA 500)\n  promo p1: auto-paused (failure rate)\n",
    });
    expect(s.promoAutoPaused).toBe(true);
    expect(s.line).toContain("AUTO-PAUSED");
  });
});

describe("tailLines", () => {
  it("returns the last n lines", () => {
    expect(tailLines("a\nb\nc\nd\ne", 2)).toBe("d\ne");
    expect(tailLines("a\nb", 10)).toBe("a\nb");
    expect(tailLines("", 5)).toBe("");
  });
});

describe("formatLogLine", () => {
  it("stamps YYYY-MM-DD HH:MM:SS then the message", () => {
    const line = formatLogLine(new Date(2026, 8, 9, 17, 4, 2), "hello");
    expect(line).toBe("2026-09-09 17:04:02  hello");
  });
});
