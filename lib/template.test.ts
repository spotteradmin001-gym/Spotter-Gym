import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPLATES, renderTemplate } from "./template";

describe("renderTemplate", () => {
  it("fills every placeholder, including repeats and spaced braces", () => {
    const out = renderTemplate(
      "Hi {{name}}, {{ amount }} is due {{due_date}}. Thanks {{name}}.",
      { name: "Priya", amount: "₹1,500", due_date: "5 Oct" },
    );
    expect(out).toBe("Hi Priya, ₹1,500 is due 5 Oct. Thanks Priya.");
  });

  it("leaves an unknown placeholder untouched", () => {
    expect(
      renderTemplate("{{name}} {{unknown}}", {
        name: "A",
        amount: "x",
        due_date: "y",
      }),
    ).toBe("A {{unknown}}");
  });

  it("the shipped defaults render cleanly", () => {
    for (const body of Object.values(DEFAULT_TEMPLATES)) {
      const out = renderTemplate(body, {
        name: "Priya",
        amount: "₹1,500.00",
        due_date: "5 Oct 2026",
      });
      expect(out).not.toMatch(/\{\{/);
    }
  });
});
