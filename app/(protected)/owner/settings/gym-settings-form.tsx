"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Gym } from "@/db/queries";
import { paiseToRupees } from "@/lib/money";
import type { ActionState } from "@/lib/result";

import { saveGymSettingsAction } from "./actions";
import { UseLocationButton } from "./use-location-button";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save settings"}
    </Button>
  );
}

export function GymSettingsForm({ gym }: { gym: Gym }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveGymSettingsAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <FormField htmlFor="s-name" label="Gym name" className="sm:col-span-2">
        <Input id="s-name" name="name" defaultValue={gym.name} required minLength={2} />
      </FormField>
      <FormField htmlFor="s-tz" label="Timezone">
        <Input id="s-tz" name="timezone" defaultValue={gym.timezone} />
      </FormField>
      <FormField htmlFor="s-addr" label="Address">
        <Input id="s-addr" name="address" defaultValue={gym.address ?? ""} />
      </FormField>
      <FormField htmlFor="s-lat" label="Check-in latitude">
        <Input id="s-lat" name="geoLat" type="number" step="any" defaultValue={gym.geoLat ?? ""} />
      </FormField>
      <FormField htmlFor="s-lng" label="Check-in longitude">
        <Input id="s-lng" name="geoLng" type="number" step="any" defaultValue={gym.geoLng ?? ""} />
      </FormField>
      <UseLocationButton latInputId="s-lat" lngInputId="s-lng" />
      <FormField htmlFor="s-radius" label="Check-in radius (m)">
        <Input
          id="s-radius"
          name="checkinRadiusM"
          type="number"
          min={10}
          max={5000}
          defaultValue={gym.checkinRadiusM}
        />
      </FormField>
      <FormField htmlFor="s-fee" label="Default monthly fee (₹)">
        <Input
          id="s-fee"
          name="defaultMonthlyFeeRupees"
          type="number"
          min={0}
          step="1"
          defaultValue={
            gym.defaultMonthlyFeePaise == null
              ? ""
              : paiseToRupees(gym.defaultMonthlyFeePaise)
          }
        />
      </FormField>
      <FormField htmlFor="s-mode" label="Billing anchor">
        <Select id="s-mode" name="billingAnchorMode" defaultValue={gym.billingAnchorMode}>
          <option value="per_member">Per member (each member&apos;s own day)</option>
          <option value="fixed">Fixed day for everyone</option>
        </Select>
      </FormField>
      <FormField htmlFor="s-day" label="Fixed billing day (1–28)">
        <Input
          id="s-day"
          name="billingAnchorDay"
          type="number"
          min={1}
          max={28}
          defaultValue={gym.billingAnchorDay}
        />
      </FormField>
      <FormField htmlFor="s-days" label="Reminder days before due">
        <Input
          id="s-days"
          name="reminderDaysBefore"
          type="number"
          min={0}
          max={30}
          defaultValue={gym.reminderDaysBefore}
        />
      </FormField>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Reminders send from</span>
        <p className="text-xs text-muted">
          The WhatsApp session this gym sends from. Set by the Spotter team — ask
          your admin to change it.
        </p>
        <p className="rounded-md border border-border bg-muted-background px-3 py-2 text-sm">
          {gym.wahaSessionName ?? "—"}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SaveButton />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {state?.ok && <p className="text-sm text-success">Saved.</p>}
      </div>
    </form>
  );
}
