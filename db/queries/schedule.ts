import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { gymHolidays, gyms } from "@/db/schema";
import { billingCycleWindow, weekdayOf } from "@/lib/billing";
import { addDays } from "@/lib/streak";

/** Caller-facing failures; the server-action layer maps this to user copy. */
export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleError";
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type GymHoliday = { id: string; date: string; label: string };

export type GymSchedule = {
  /** JS weekday numbers the gym is normally closed, 0 = Sunday. Sorted. */
  closedWeekdays: number[];
  holidays: GymHoliday[];
};

async function loadGym(gymId: string): Promise<{
  anchorDay: number;
  closedWeekdays: number[];
}> {
  const [row] = await db
    .select({
      anchorDay: gyms.billingAnchorDay,
      closedWeekdays: gyms.closedWeekdays,
    })
    .from(gyms)
    .where(eq(gyms.id, gymId))
    .limit(1);
  if (!row) throw new ScheduleError("That gym no longer exists.");
  return {
    anchorDay: row.anchorDay,
    closedWeekdays: [...row.closedWeekdays].sort((a, b) => a - b),
  };
}

export async function getGymSchedule(gymId: string): Promise<GymSchedule> {
  const [{ closedWeekdays }, holidayRows] = await Promise.all([
    loadGym(gymId),
    db
      .select({
        id: gymHolidays.id,
        date: gymHolidays.date,
        label: gymHolidays.label,
      })
      .from(gymHolidays)
      .where(eq(gymHolidays.gymId, gymId))
      .orderBy(asc(gymHolidays.date)),
  ]);
  return { closedWeekdays, holidays: holidayRows };
}

/**
 * The first calendar day an owner is allowed to add or remove a holiday for.
 * Everything on or after this date is in a future billing cycle; everything
 * before it sits in the current or a past cycle and is locked, so a member
 * cannot have a missed open day retroactively reclassified as a rest day
 * (CR-9 / 9e). The gym-level cycle uses `gyms.billing_anchor_day`.
 */
export async function scheduleLockBoundary(
  gymId: string,
  today: Date | string = new Date(),
): Promise<string> {
  const { anchorDay } = await loadGym(gymId);
  return billingCycleWindow(anchorDay, today).end;
}

function assertWeekdays(weekdays: number[]): number[] {
  const clean = [...new Set(weekdays)].sort((a, b) => a - b);
  if (clean.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new ScheduleError("Weekdays must be numbers from 0 (Sunday) to 6 (Saturday).");
  }
  if (clean.length > 6) {
    throw new ScheduleError("A gym must be open at least one day a week.");
  }
  return clean;
}

/**
 * Replace the weekly closed-day pattern. Not cycle-locked: this is a
 * forward-looking pattern and `closedDates` applies whatever is current. The
 * one-off holiday list is where the per-cycle lock lives (that is the exact
 * gaming vector called out in 9e).
 */
export async function setClosedWeekdays(
  gymId: string,
  weekdays: number[],
): Promise<void> {
  const clean = assertWeekdays(weekdays);
  const rows = await db
    .update(gyms)
    .set({ closedWeekdays: clean, updatedAt: new Date() })
    .where(eq(gyms.id, gymId))
    .returning({ id: gyms.id });
  if (rows.length === 0) throw new ScheduleError("That gym no longer exists.");
}

export async function addHoliday(input: {
  gymId: string;
  date: string;
  label: string;
  today?: Date | string;
}): Promise<GymHoliday> {
  const date = input.date.trim();
  const label = input.label.trim();
  if (!ISO_DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new ScheduleError("Enter a valid date.");
  }
  if (label.length < 2) throw new ScheduleError("Enter a label for the holiday.");
  if (label.length > 80) throw new ScheduleError("Keep the label under 80 characters.");

  const boundary = await scheduleLockBoundary(input.gymId, input.today);
  if (date < boundary) {
    throw new ScheduleError(
      `The current billing cycle is locked. Pick a date on or after ${boundary}.`,
    );
  }

  const [existing] = await db
    .select({ id: gymHolidays.id })
    .from(gymHolidays)
    .where(and(eq(gymHolidays.gymId, input.gymId), eq(gymHolidays.date, date)))
    .limit(1);
  if (existing) throw new ScheduleError("That date is already on the holiday list.");

  const [row] = await db
    .insert(gymHolidays)
    .values({ gymId: input.gymId, date, label })
    .returning({ id: gymHolidays.id, date: gymHolidays.date, label: gymHolidays.label });
  return row!;
}

export async function removeHoliday(input: {
  gymId: string;
  id: string;
  today?: Date | string;
}): Promise<void> {
  const [row] = await db
    .select({ date: gymHolidays.date })
    .from(gymHolidays)
    .where(and(eq(gymHolidays.id, input.id), eq(gymHolidays.gymId, input.gymId)))
    .limit(1);
  if (!row) return; // already gone / wrong gym — no-op

  const boundary = await scheduleLockBoundary(input.gymId, input.today);
  if (row.date < boundary) {
    throw new ScheduleError(
      `That holiday is inside a locked billing cycle and can't be removed.`,
    );
  }

  await db
    .delete(gymHolidays)
    .where(and(eq(gymHolidays.id, input.id), eq(gymHolidays.gymId, input.gymId)));
}

/**
 * The set of `YYYY-MM-DD` days the gym is closed across the inclusive range
 * `[from, to]` — the weekly closed-weekday pattern merged with the one-off
 * holiday list. This is the single source the streak logic (E.2), calendar
 * (E.3) and reward engine (E.5) read.
 */
export async function closedDates(
  gymId: string,
  from: string,
  to: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to) || from > to) return out;

  const { closedWeekdays, holidays } = await getGymSchedule(gymId);
  const closedWd = new Set(closedWeekdays);

  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (closedWd.has(weekdayOf(day))) out.add(day);
  }
  for (const h of holidays) {
    if (h.date >= from && h.date <= to) out.add(h.date);
  }
  return out;
}
