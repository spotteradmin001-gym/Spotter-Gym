import "server-only";

import { redirect } from "next/navigation";

import {
  getMemberByUserId,
  getSessionUser,
  listProfileFields,
  profileComplete,
  type Member,
} from "@/db/queries";

import { readSessionCookie } from "./session-cookie";

/**
 * Page guard for the member app. Resolves the session to its member record;
 * redirects to /login when not a signed-in member. `mustChangePassword` is
 * never set for members (they pick their password at activation), so there's
 * no interceptor here.
 */
export async function requireMemberSelf(): Promise<{ member: Member }> {
  const user = await getSessionUser(await readSessionCookie());
  if (!user || user.role !== "member") redirect("/login");
  const member = await getMemberByUserId(user!.id);
  if (!member) redirect("/login");
  return { member };
}

/**
 * As `requireMemberSelf`, plus: sends the member to /m/profile until every
 * required profile field is filled. Every member page except /m/profile calls
 * this.
 */
export async function requireCompleteProfile(): Promise<{ member: Member }> {
  const { member } = await requireMemberSelf();
  const fields = await listProfileFields(member.gymId);
  if (!profileComplete(member.profile, fields)) redirect("/m/profile");
  return { member };
}
