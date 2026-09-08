import type { UserRole } from "@/db/queries";

/**
 * Pure view logic for the "Show temp password" / "Reset password" controls
 * (CR-6, Phase C Batch C.3). Kept out of the client component so both the
 * component and its tests read from one place.
 *
 * - Reveal applies only to owner and employee accounts. Members use the
 *   activation-token model and never have a retrievable password.
 * - Reveal additionally needs the vault configured (`CREDENTIAL_ENC_KEY`).
 * - Reset applies to every non-admin account, vault or no vault — with the key
 *   unset it simply regenerates and shows the value once.
 */

/** Result payloads for the reveal / reset server actions. */
export type RevealResult = { password: string | null };
export type ResetResult = {
  password: string;
  shareMessage: string;
  resetLink: string;
};

export type RevealDisabledReason = "vault-off" | "not-applicable";

export type CredentialControlsView = {
  showReveal: boolean;
  showReset: boolean;
  revealDisabledReason: RevealDisabledReason | null;
};

export function credentialControlsView(input: {
  targetRole: UserRole;
  vaultEnabled: boolean;
}): CredentialControlsView {
  const revealApplies =
    input.targetRole === "owner" || input.targetRole === "employee";

  return {
    showReset: input.targetRole !== "admin",
    showReveal: revealApplies && input.vaultEnabled,
    revealDisabledReason: !revealApplies
      ? "not-applicable"
      : !input.vaultEnabled
        ? "vault-off"
        : null,
  };
}
