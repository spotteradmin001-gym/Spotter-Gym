import { afterEach, describe, expect, it, vi } from "vitest";

import { isMailerConfigured, sendMail } from "./mail";

const original = process.env.MAIL_HOST;

afterEach(() => {
  if (original === undefined) delete process.env.MAIL_HOST;
  else process.env.MAIL_HOST = original;
  vi.restoreAllMocks();
});

describe("mailer", () => {
  it("reports not configured when MAIL_HOST is unset", () => {
    delete process.env.MAIL_HOST;
    expect(isMailerConfigured()).toBe(false);
  });

  it("reports configured when MAIL_HOST is set", () => {
    process.env.MAIL_HOST = "smtp.example.com";
    expect(isMailerConfigured()).toBe(true);
  });

  it("logs to the console instead of sending when not configured", async () => {
    delete process.env.MAIL_HOST;
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await sendMail({ to: "a@example.com", subject: "Hi", text: "body" });

    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]![0]).toContain("a@example.com");
  });
});
