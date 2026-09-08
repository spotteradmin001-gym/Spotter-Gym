import { describe, expect, it } from "vitest";

import { credentialControlsView } from "./credential-ui";

describe("credentialControlsView", () => {
  it("owner / employee with the vault on: both controls, reveal enabled", () => {
    for (const targetRole of ["owner", "employee"] as const) {
      expect(credentialControlsView({ targetRole, vaultEnabled: true })).toEqual({
        showReveal: true,
        showReset: true,
        revealDisabledReason: null,
      });
    }
  });

  it("owner / employee with the vault off: reset only, reveal shows the enable note", () => {
    expect(
      credentialControlsView({ targetRole: "employee", vaultEnabled: false }),
    ).toEqual({
      showReveal: false,
      showReset: true,
      revealDisabledReason: "vault-off",
    });
  });

  it("member: reset only, reveal never applies", () => {
    expect(
      credentialControlsView({ targetRole: "member", vaultEnabled: true }),
    ).toEqual({
      showReveal: false,
      showReset: true,
      revealDisabledReason: "not-applicable",
    });
  });

  it("admin target: no controls at all", () => {
    expect(
      credentialControlsView({ targetRole: "admin", vaultEnabled: true }),
    ).toEqual({
      showReveal: false,
      showReset: false,
      revealDisabledReason: "not-applicable",
    });
  });
});
