/**
 * The granular capabilities an owner can grant an employee. Pure constant so
 * both the schema/queries (server) and the permission form (client) import it
 * from one place.
 */
export const EMPLOYEE_PERMISSIONS = [
  "member.create",
  "member.edit",
  "payment.record",
  "expense.create",
  "expense.edit",
] as const;

export type Permission = (typeof EMPLOYEE_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "member.create": "Add members",
  "member.edit": "Edit members",
  "payment.record": "Record payments",
  "expense.create": "Add expenses",
  "expense.edit": "Edit expenses",
};
