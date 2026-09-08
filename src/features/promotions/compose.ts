import "server-only";

import { listMembers } from "@/db/queries";
import {
  assertValidPromoImage,
  isPromoMediaEnabled,
  PromoMediaError,
  uploadPromoImage,
} from "@/lib/promo-media";
import {
  type MemberOption,
  resolveRecipients,
} from "@/lib/promo-recipients";
import { ActionError } from "@/lib/result";

export type ParsedCompose = {
  body: string | null;
  imageDriveFileId: string | null;
  imageMime: string | null;
  recipients: Array<{
    phone: string;
    memberId: string | null;
    source: "member" | "contact";
  }>;
  memberCount: number;
  contactCount: number;
};

/**
 * Shared server-side parse for the promotion compose form (owner + employee).
 * Re-runs the F.3 pure `resolveRecipients` on freshly-loaded members so the
 * client can never smuggle a number past the member-match / dedupe rules,
 * enforces the confirmation checkbox (guardrail 2), and uploads any image to
 * Drive. Throws `ActionError` with user-facing copy.
 */
export async function parseComposeForm(
  gymId: string,
  form: FormData,
): Promise<ParsedCompose> {
  const body = String(form.get("body") ?? "").trim() || null;

  let payload: {
    memberIds?: unknown;
    contactsText?: unknown;
    confirmed?: unknown;
  };
  try {
    payload = JSON.parse(String(form.get("recipients") ?? "{}"));
  } catch {
    throw new ActionError("Pick some recipients and try again.");
  }
  if (payload.confirmed !== true) {
    throw new ActionError(
      "Tick the confirmation that you only added numbers you already message on WhatsApp.",
    );
  }
  const selectedMemberIds = Array.isArray(payload.memberIds)
    ? payload.memberIds.map(String)
    : [];
  const contactsText =
    typeof payload.contactsText === "string" ? payload.contactsText : "";

  const members = await listMembers(gymId);
  const options: MemberOption[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    phone: m.phone,
    status: m.status,
  }));
  const resolved = resolveRecipients({
    selectedMemberIds,
    members: options,
    contactsText,
  });
  if (resolved.totalCount < 1) {
    throw new ActionError("Add at least one valid recipient.");
  }

  let imageDriveFileId: string | null = null;
  let imageMime: string | null = null;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    if (!isPromoMediaEnabled()) {
      throw new ActionError(
        "Image upload is not available right now — remove the image and submit text-only.",
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      assertValidPromoImage(bytes, file.type);
      imageDriveFileId = await uploadPromoImage(bytes, file.type);
      imageMime = file.type;
    } catch (error) {
      if (error instanceof PromoMediaError) throw new ActionError(error.message);
      throw error;
    }
  }

  if (!body && !imageDriveFileId) {
    throw new ActionError("Add a message, an image, or both.");
  }

  return {
    body,
    imageDriveFileId,
    imageMime,
    recipients: resolved.recipients.map((r) => ({
      phone: r.phone,
      memberId: r.memberId,
      source: r.source,
    })),
    memberCount: resolved.memberCount,
    contactCount: resolved.contactCount,
  };
}
