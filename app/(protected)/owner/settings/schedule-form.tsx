"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { Gym, GymHoliday } from "@/db/queries";
import type { ActionState } from "@/lib/result";

import { addHolidayAction, removeHolidayAction, saveScheduleAction } from "./actions";

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function ScheduleForm({
  gym,
  closedWeekdays,
  holidays,
  lockBoundary,
}: {
  gym: Gym;
  closedWeekdays: number[];
  holidays: GymHoliday[];
  lockBoundary: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveScheduleAction,
    null,
  );
  const [holidayState, holidayAction] = useActionState<ActionState, FormData>(
    addHolidayAction,
    null,
  );
  const closed = new Set(closedWeekdays);
  const error = state && !state.ok ? state.error : undefined;
  const holidayError =
    holidayState && !holidayState.ok ? holidayState.error : undefined;
  const rewardOff = gym.streakRewardPercent === 0;

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Weekly closed days</legend>
          <p className="text-xs text-muted">
            A closed day never needs a check-in and never breaks a member&apos;s
            streak. Changes apply to streak scoring from the next billing cycle.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {WEEKDAYS.map((d) => (
              <label key={d.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="closedWeekday"
                  value={d.value}
                  defaultChecked={closed.has(d.value)}
                />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            htmlFor="sr-percent"
            label="Streak reward discount (%)"
            hint="0 turns the attendance reward off for this gym"
          >
            <Input
              id="sr-percent"
              name="streakRewardPercent"
              type="number"
              min={0}
              max={100}
              step="1"
              defaultValue={gym.streakRewardPercent}
            />
          </FormField>
          <FormField
            htmlFor="sr-misses"
            label="Allowed misses per cycle"
            hint="open days a member may miss and still qualify"
          >
            <Input
              id="sr-misses"
              name="streakAllowedMisses"
              type="number"
              min={0}
              max={31}
              step="1"
              defaultValue={gym.streakAllowedMisses}
            />
          </FormField>
        </div>

        <div className="flex items-center gap-3">
          <SaveButton label="Save schedule" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {state?.ok && <p className="text-sm text-success">Saved.</p>}
          {rewardOff && !error && (
            <p className="text-sm text-muted">Attendance reward is off.</p>
          )}
        </div>
      </form>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">Holidays</p>
          <p className="text-xs text-muted">
            One-off closed dates. The current billing cycle is locked — you can
            only add or remove holidays on or after{" "}
            <span className="font-mono">{lockBoundary}</span>.
          </p>
        </div>

        {holidays.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {holidays.map((h) => {
              const locked = h.date < lockBoundary;
              return (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-mono">{h.date}</span> — {h.label}
                  </span>
                  {locked ? (
                    <span className="text-xs text-muted">Locked</span>
                  ) : (
                    <form action={removeHolidayAction}>
                      <input type="hidden" name="id" value={h.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Remove
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form
          action={holidayAction}
          className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end"
        >
          <FormField htmlFor="h-date" label="Date">
            <Input id="h-date" name="date" type="date" min={lockBoundary} required />
          </FormField>
          <FormField htmlFor="h-label" label="Label">
            <Input id="h-label" name="label" required minLength={2} maxLength={80} />
          </FormField>
          <Button type="submit" size="md">
            Add holiday
          </Button>
          {holidayError && (
            <p role="alert" className="text-sm text-destructive sm:col-span-3">
              {holidayError}
            </p>
          )}
          {holidayState?.ok && (
            <p className="text-sm text-success sm:col-span-3">Holiday added.</p>
          )}
        </form>
      </div>
    </div>
  );
}
