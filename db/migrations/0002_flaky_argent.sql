CREATE TABLE "gyms" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"address" text,
	"geo_lat" double precision,
	"geo_lng" double precision,
	"checkin_radius_m" integer DEFAULT 100 NOT NULL,
	"waha_session_name" text,
	"default_monthly_fee_paise" integer,
	"reminder_days_before" integer DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gyms_slug_unique" UNIQUE("slug"),
	CONSTRAINT "gyms_reminder_days_before_check" CHECK ("gyms"."reminder_days_before" between 0 and 30),
	CONSTRAINT "gyms_checkin_radius_check" CHECK ("gyms"."checkin_radius_m" between 10 and 5000)
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;