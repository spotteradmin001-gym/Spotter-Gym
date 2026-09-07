CREATE TABLE "checkins" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"gym_id" text NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checkin_date" date NOT NULL,
	"method" text DEFAULT 'qr' NOT NULL,
	"geo_lat" double precision,
	"geo_lng" double precision,
	"distance_m" integer,
	CONSTRAINT "checkins_member_day_unique" UNIQUE("member_id","checkin_date"),
	CONSTRAINT "checkins_method_check" CHECK ("checkins"."method" in ('qr'))
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkins_gym_date_idx" ON "checkins" USING btree ("gym_id","checkin_date");--> statement-breakpoint
CREATE INDEX "checkins_member_idx" ON "checkins" USING btree ("member_id");