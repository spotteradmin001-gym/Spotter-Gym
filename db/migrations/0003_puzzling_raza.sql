CREATE TABLE "member_profile_fields" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"field_type" text DEFAULT 'text' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_profile_fields_gym_key_unique" UNIQUE("gym_id","key"),
	CONSTRAINT "member_profile_fields_type_check" CHECK ("member_profile_fields"."field_type" in ('text', 'number', 'date'))
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_gym_kind_unique" UNIQUE("gym_id","kind"),
	CONSTRAINT "message_templates_kind_check" CHECK ("message_templates"."kind" in ('pre_due', 'on_due'))
);
--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "billing_anchor_mode" text DEFAULT 'per_member' NOT NULL;--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "billing_anchor_day" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_profile_fields" ADD CONSTRAINT "member_profile_fields_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_billing_anchor_mode_check" CHECK ("gyms"."billing_anchor_mode" in ('per_member', 'fixed'));--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_billing_anchor_day_check" CHECK ("gyms"."billing_anchor_day" between 1 and 28);