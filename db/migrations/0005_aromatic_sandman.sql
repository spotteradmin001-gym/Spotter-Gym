CREATE TABLE "dues" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"gym_id" text NOT NULL,
	"period_month" date NOT NULL,
	"amount_due_paise" integer NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dues_member_period_unique" UNIQUE("member_id","period_month"),
	CONSTRAINT "dues_status_check" CHECK ("dues"."status" in ('pending', 'paid', 'waived')),
	CONSTRAINT "dues_amount_check" CHECK ("dues"."amount_due_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "dues" ADD CONSTRAINT "dues_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues" ADD CONSTRAINT "dues_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dues_gym_status_idx" ON "dues" USING btree ("gym_id","status");--> statement-breakpoint
CREATE INDEX "dues_gym_due_date_idx" ON "dues" USING btree ("gym_id","due_date");--> statement-breakpoint
CREATE INDEX "dues_member_idx" ON "dues" USING btree ("member_id");