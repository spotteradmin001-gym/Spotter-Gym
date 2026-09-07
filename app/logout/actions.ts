"use server";

import { redirect } from "next/navigation";

import { deleteSession } from "@/db/queries";
import {
  clearSessionCookie,
  readSessionCookie,
} from "@/src/features/auth/session-cookie";

/** Revokes the current session row and clears its cookie, then back to login. */
export async function logoutAction(): Promise<void> {
  const sessionId = await readSessionCookie();
  await deleteSession(sessionId);
  await clearSessionCookie();
  redirect("/login");
}
