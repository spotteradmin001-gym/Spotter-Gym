CREATE TABLE "gym_holidays" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" text NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_holidays_gym_date_unique" UNIQUE("gym_id","date")
);
--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "closed_weekdays" smallint[] DEFAULT '{0}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "streak_reward_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "streak_allowed_misses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gym_holidays" ADD CONSTRAINT "gym_holidays_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gym_holidays_gym_idx" ON "gym_holidays" USING btree ("gym_id");--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_streak_reward_percent_check" CHECK ("gyms"."streak_reward_percent" between 0 and 100);--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_streak_allowed_misses_check" CHECK ("gyms"."streak_allowed_misses" between 0 and 31);