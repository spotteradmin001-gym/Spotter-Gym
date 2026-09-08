import { describe, expect, it } from "vitest";

import { isActivePath } from "./nav";

describe("isActivePath", () => {
  it("matches an exact path", () => {
    expect(isActivePath("/owner", "/owner")).toBe(true);
    expect(isActivePath("/owner/members", "/owner/members")).toBe(true);
  });

  it("keeps a section root (single segment) active only on its exact path", () => {
    expect(isActivePath("/owner/members", "/owner")).toBe(false);
    expect(isActivePath("/admin/gyms", "/admin")).toBe(false);
  });

  it("keeps a deeper link active on its own child routes", () => {
    expect(isActivePath("/owner/members/123", "/owner/members")).toBe(true);
    expect(isActivePath("/admin/gyms/abc/users/9", "/admin/gyms")).toBe(true);
  });

  it("does not match a sibling with a shared prefix", () => {
    expect(isActivePath("/owner/members-archive", "/owner/members")).toBe(false);
    expect(isActivePath("/owner/staff-activity", "/owner/staff")).toBe(false);
  });

  it("is false for empty inputs", () => {
    expect(isActivePath("", "/owner")).toBe(false);
    expect(isActivePath("/owner", "")).toBe(false);
  });
});
