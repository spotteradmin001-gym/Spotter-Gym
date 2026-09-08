CREATE TABLE "reminder_jobs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" text NOT NULL,
	"member_id" text NOT NULL,
	"due_id" text NOT NULL,
	"kind" text NOT NULL,
	"scheduled_for" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"waha_session" text,
	"message_text" text NOT NULL,
	"sent_at" timestamp with time zone,
	"waha_message_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_jobs_due_kind_unique" UNIQUE("due_id","kind"),
	CONSTRAINT "reminder_jobs_kind_check" CHECK ("reminder_jobs"."kind" in ('pre_due', 'on_due')),
	CONSTRAINT "reminder_jobs_status_check" CHECK ("reminder_jobs"."status" in ('pending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_due_id_dues_id_fk" FOREIGN KEY ("due_id") REFERENCES "public"."dues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminder_jobs_send_queue_idx" ON "reminder_jobs" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "reminder_jobs_gym_status_idx" ON "reminder_jobs" USING btree ("gym_id","status");--> statement-breakpoint
CREATE INDEX "reminder_jobs_member_idx" ON "reminder_jobs" USING btree ("member_id");