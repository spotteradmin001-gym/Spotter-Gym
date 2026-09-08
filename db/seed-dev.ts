/**
 * Seeds one fully-populated demo gym for local / preview work.
 *
 *   npm run db:seed-dev
 *
 * Idempotent: it first wipes any existing `demo-gym` (and its users), then
 * rebuilds. Refuses to run when NODE_ENV=production.
 *
 * Prints the demo logins at the end.
 */
import "./load-env";

import { eq, inArray } from "drizzle-orm";

import { hashPassword } from "../src/features/auth/password";
import { closeDb, db } from "./client";
import {
  activateMember,
  createEmployee,
  createGym,
  createMember,
  createMemberActivationToken,
  generateDuesForGym,
  planRemindersForGym,
  recordPayment,
  setMemberStatus,
  setPermissions,
  updateGym,
} from "./queries/index";
import {
  checkins,
  dues,
  employeePermissions,
  employees,
  gyms,
  memberActivationTokens,
  memberProfileFields,
  members,
  messageTemplates,
  payments,
  permissionRequests,
  reminderJobs,
  users,
} from "./schema";

if (process.env.NODE_ENV === "production") {
  throw new Error("db:seed-dev refuses to run with NODE_ENV=production.");
}

const OWNER_EMAIL = "owner@demo.spotter";
const OWNER_PW = "DemoOwner#2026";
const MEMBER_EMAIL = "member@demo.spotter";
const MEMBER_PW = "DemoMember#2026";

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const today = new Date().toISOString().slice(0, 10);

async function wipeExistingDemo(): Promise<void> {
  const gymIds = (
    await db.select({ id: gyms.id }).from(gyms).where(eq(gyms.slug, "demo-gym"))
  ).map((r) => r.id);
  if (gymIds.length === 0) return;

  for (const gid of gymIds) {
    const memberIds = (
      await db.select({ id: members.id }).from(members).where(eq(members.gymId, gid))
    ).map((r) => r.id);
    const employeeIds = (
      await db.select({ id: employees.id }).from(employees).where(eq(employees.gymId, gid))
    ).map((r) => r.id);

    if (memberIds.length) {
      await db.delete(reminderJobs).where(inArray(reminderJobs.memberId, memberIds));
      await db.delete(checkins).where(inArray(checkins.memberId, memberIds));
      await db.delete(payments).where(inArray(payments.memberId, memberIds));
      await db.delete(dues).where(inArray(dues.memberId, memberIds));
      await db
        .delete(memberActivationTokens)
        .where(inArray(memberActivationTokens.memberId, memberIds));
    }
    if (employeeIds.length) {
      await db
        .delete(employeePermissions)
        .where(inArray(employeePermissions.employeeId, employeeIds));
      await db
        .delete(permissionRequests)
        .where(inArray(permissionRequests.employeeId, employeeIds));
    }
    await db.delete(employees).where(eq(employees.gymId, gid));
    await db.delete(members).where(eq(members.gymId, gid));
    await db.delete(memberProfileFields).where(eq(memberProfileFields.gymId, gid));
    await db.delete(messageTemplates).where(eq(messageTemplates.gymId, gid));
    await db.delete(users).where(eq(users.gymId, gid));
    await db.delete(gyms).where(eq(gyms.id, gid));
  }
}

async function main(): Promise<void> {
  console.log("Wiping any existing demo-gym ...");
  await wipeExistingDemo();

  console.log("Creating Demo Gym ...");
  const gym = await createGym({ name: "Demo Gym" });
  await updateGym(gym.id, {
    address: "1 MG Road, Bengaluru",
    geoLat: 12.9716,
    geoLng: 77.5946,
    checkinRadiusM: 150,
    defaultMonthlyFeePaise: 150000,
    billingAnchorMode: "fixed",
    billingAnchorDay: 5,
    reminderDaysBefore: 3,
    wahaSessionName: "demo",
  });

  const [ownerRow] = await db
    .insert(users)
    .values({
      email: OWNER_EMAIL,
      role: "owner",
      gymId: gym.id,
      passwordHash: hashPassword(OWNER_PW),
      mustChangePassword: false,
    })
    .returning({ id: users.id });
  const ownerId = ownerRow!.id;

  console.log("Employees ...");
  const front = await createEmployee({
    gymId: gym.id,
    name: "Front Desk",
    email: "frontdesk@demo.spotter",
  });
  await setPermissions({
    gymId: gym.id,
    employeeId: front.employee.id,
    grantedBy: ownerId,
    permissions: [
      { permission: "member.create", requiresApproval: false },
      { permission: "payment.record", requiresApproval: false },
    ],
  });
  const trainer = await createEmployee({
    gymId: gym.id,
    name: "Trainer",
    email: "trainer@demo.spotter",
  });
  await setPermissions({
    gymId: gym.id,
    employeeId: trainer.employee.id,
    grantedBy: ownerId,
    permissions: [{ permission: "member.edit", requiresApproval: true }],
  });

  console.log("Members ...");
  const specs = [
    { name: "Aarav Sharma", phone: "9800000001", join: daysAgo(200), pay: "full" },
    { name: "Diya Patel", phone: "9800000002", join: daysAgo(90), pay: "full" },
    { name: "Vivaan Rao", phone: "9800000003", join: daysAgo(45), pay: "partial" },
    { name: "Ananya Iyer", phone: "9800000004", join: daysAgo(20), pay: "none" },
    { name: "Kabir Nair", phone: "9800000005", join: daysAgo(400), pay: "none", inactive: true },
    { name: "Meera Krishnan", phone: "9800000006", join: today, pay: "none" },
  ];

  const madeMembers = [];
  for (const s of specs) {
    const m = await createMember({
      gymId: gym.id,
      name: s.name,
      phone: s.phone,
      email: `${s.name.split(" ")[0]!.toLowerCase()}@demo.spotter`,
      joinDate: s.join,
    });
    madeMembers.push({ ...s, id: m.id });
  }

  await generateDuesForGym(gym.id);

  for (const m of madeMembers) {
    if (m.pay === "full") {
      await recordPayment({
        gymId: gym.id,
        memberId: m.id,
        amountPaise: 150000,
        paidOn: daysAgo(2),
        method: "upi",
        recordedBy: ownerId,
      });
    } else if (m.pay === "partial") {
      await recordPayment({
        gymId: gym.id,
        memberId: m.id,
        amountPaise: 60000,
        paidOn: daysAgo(1),
        method: "cash",
        recordedBy: ownerId,
      });
    }
    if (m.inactive) await setMemberStatus(gym.id, m.id, "inactive");
  }

  console.log("Activating a member login + check-ins ...");
  const activate = madeMembers.find((m) => m.name === "Diya Patel")!;
  const { token } = await createMemberActivationToken(gym.id, activate.id);
  const { userId: memberUserId } = await activateMember(token, {
    email: MEMBER_EMAIL,
    password: MEMBER_PW,
  });
  const memberRow = (
    await db.select().from(members).where(eq(members.userId, memberUserId)).limit(1)
  )[0]!;
  for (const n of [0, 1, 2, 4]) {
    await db.insert(checkins).values({
      memberId: memberRow.id,
      gymId: gym.id,
      checkinDate: daysAgo(n),
      method: "qr",
      geoLat: 12.9717,
      geoLng: 77.5946,
      distanceM: 30,
    });
  }

  console.log("Planning reminders ...");
  await planRemindersForGym(gym.id);

  console.log("\nDemo gym ready.");
  console.log(`  Owner   ${OWNER_EMAIL} / ${OWNER_PW}`);
  console.log(`  Member  ${MEMBER_EMAIL} / ${MEMBER_PW}`);
  console.log(`  Check-in QR slug: ${gym.slug}`);
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    console.error(error);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
