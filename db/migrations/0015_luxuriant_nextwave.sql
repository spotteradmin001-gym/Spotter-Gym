CREATE TABLE "streak_rewards" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"gym_id" text NOT NULL,
	"earned_period" date NOT NULL,
	"redeem_period" date NOT NULL,
	"percent" integer NOT NULL,
	"status" text DEFAULT 'earned' NOT NULL,
	"applied_due_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streak_rewards_member_earned_unique" UNIQUE("member_id","earned_period"),
	CONSTRAINT "streak_rewards_status_check" CHECK ("streak_rewards"."status" in ('earned', 'applied', 'missed')),
	CONSTRAINT "streak_rewards_percent_check" CHECK ("streak_rewards"."percent" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "streak_rewards" ADD CONSTRAINT "streak_rewards_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_rewards" ADD CONSTRAINT "streak_rewards_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_rewards" ADD CONSTRAINT "streak_rewards_applied_due_id_dues_id_fk" FOREIGN KEY ("applied_due_id") REFERENCES "public"."dues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "streak_rewards_gym_status_idx" ON "streak_rewards" USING btree ("gym_id","status");--> statement-breakpoint
CREATE INDEX "streak_rewards_gym_redeem_idx" ON "streak_rewards" USING btree ("gym_id","redeem_period");--> statement-breakpoint
CREATE INDEX "streak_rewards_member_idx" ON "streak_rewards" USING btree ("member_id");