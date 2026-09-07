/**
 * WhatsApp reminder message templates — pure, shared by the owner settings
 * preview (client), the config queries (server), and the Phase 6 planner.
 */

export type TemplateKind = "pre_due" | "on_due";

export const DEFAULT_TEMPLATES: Record<TemplateKind, string> = {
  pre_due:
    "Hi {{name}}, a reminder that your gym membership fee of {{amount}} is due on {{due_date}}. See you at the gym!",
  on_due:
    "Hi {{name}}, your gym membership fee of {{amount}} is due today ({{due_date}}). Please pay at your earliest convenience.",
};

export type TemplateVars = { name: string; amount: string; due_date: string };

/** Fill `{{name}}` / `{{amount}}` / `{{due_date}}`. Unknown placeholders stay. */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body
    .replace(/\{\{\s*name\s*\}\}/g, vars.name)
    .replace(/\{\{\s*amount\s*\}\}/g, vars.amount)
    .replace(/\{\{\s*due_date\s*\}\}/g, vars.due_date);
}
