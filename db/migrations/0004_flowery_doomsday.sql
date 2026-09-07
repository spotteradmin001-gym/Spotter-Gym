CREATE TABLE "members" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"join_date" date NOT NULL,
	"monthly_fee_paise" integer,
	"billing_anchor_day" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_gym_phone_unique" UNIQUE("gym_id","phone"),
	CONSTRAINT "members_status_check" CHECK ("members"."status" in ('active', 'inactive')),
	CONSTRAINT "members_billing_anchor_day_check" CHECK ("members"."billing_anchor_day" between 1 and 28)
);
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "members_gym_id_idx" ON "members" USING btree ("gym_id");--> statement-breakpoint
CREATE INDEX "members_gym_status_idx" ON "members" USING btree ("gym_id","status");