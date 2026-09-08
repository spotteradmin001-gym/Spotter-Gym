import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getGym, getTemplates, listProfileFields } from "@/db/queries";
import { requireOwner } from "@/src/features/auth/guards";

import {
  deleteProfileFieldAction,
  toggleProfileFieldRequiredAction,
} from "./actions";
import { AddProfileFieldForm } from "./add-profile-field-form";
import { GymSettingsForm } from "./gym-settings-form";
import { TemplateForm } from "./template-form";

export const dynamic = "force-dynamic";

export default async function OwnerSettingsPage() {
  const user = await requireOwner();
  if (!user.gymId) notFound();

  const [gym, fields, templates] = await Promise.all([
    getGym(user.gymId),
    listProfileFields(user.gymId),
    getTemplates(user.gymId),
  ]);
  if (!gym) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Gym & billing</CardTitle>
          <CardDescription>
            Location fence for QR check-in, default fee, billing day and reminder
            lead time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GymSettingsForm gym={gym} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminder messages</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <TemplateForm
            kind="pre_due"
            label="Before the due date"
            initialBody={templates.pre_due}
          />
          <TemplateForm
            kind="on_due"
            label="On the due date"
            initialBody={templates.on_due}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Member profile fields</CardTitle>
          <CardDescription>
            Extra details every member fills in when they complete their profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {fields.length > 0 && (
            <Table variant="stacked">
              <THead>
                <TR>
                  <TH>Label</TH>
                  <TH>Key</TH>
                  <TH>Type</TH>
                  <TH>Required</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {fields.map((f) => (
                  <TR key={f.id}>
                    <TD label="Label">{f.label}</TD>
                    <TD label="Key" className="font-mono text-xs">{f.key}</TD>
                    <TD label="Type">{f.fieldType}</TD>
                    <TD label="Required">
                      <form action={toggleProfileFieldRequiredAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="required" value={String(!f.required)} />
                        <Button type="submit" variant="ghost" size="sm">
                          {f.required ? "Yes" : "No"}
                        </Button>
                      </form>
                    </TD>
                    <TD className="text-right">
                      <form action={deleteProfileFieldAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Remove
                        </Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          <AddProfileFieldForm />
        </CardContent>
      </Card>
    </div>
  );
}
