CREATE TABLE "promotion_recipients" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" text NOT NULL,
	"phone" text NOT NULL,
	"member_id" text,
	"source" text NOT NULL,
	"wa_exists" boolean,
	"text_status" text DEFAULT 'pending' NOT NULL,
	"text_waha_id" text,
	"text_error" text,
	"image_status" text DEFAULT 'pending' NOT NULL,
	"image_waha_id" text,
	"image_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_recipients_promotion_phone_unique" UNIQUE("promotion_id","phone"),
	CONSTRAINT "promotion_recipients_source_check" CHECK ("promotion_recipients"."source" in ('member', 'contact')),
	CONSTRAINT "promotion_recipients_text_status_check" CHECK ("promotion_recipients"."text_status" in ('pending', 'sent', 'failed', 'skipped', 'n/a')),
	CONSTRAINT "promotion_recipients_image_status_check" CHECK ("promotion_recipients"."image_status" in ('pending', 'sent', 'failed', 'skipped', 'n/a'))
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" text NOT NULL,
	"created_by_user_id" text,
	"body" text,
	"image_drive_file_id" text,
	"image_mime" text,
	"has_text" boolean DEFAULT false NOT NULL,
	"has_image" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"settlement" text DEFAULT 'none' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"per_message_paise" integer,
	"estimated_total_paise" integer,
	"prepaid_paise" integer,
	"billed_total_paise" integer,
	"refund_paise" integer,
	"admin_note" text,
	"paused_at" timestamp with time zone,
	"pause_reason" text,
	"submitted_at" timestamp with time zone,
	"priced_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_status_check" CHECK ("promotions"."status" in ('draft', 'submitted', 'priced', 'approved', 'paid', 'sending', 'sent', 'partly_failed', 'failed', 'rejected', 'cancelled')),
	CONSTRAINT "promotions_settlement_check" CHECK ("promotions"."settlement" in ('none', 'settled', 'refund_due', 'refunded')),
	CONSTRAINT "promotions_recipient_count_check" CHECK ("promotions"."recipient_count" >= 0),
	CONSTRAINT "promotions_per_message_paise_check" CHECK ("promotions"."per_message_paise" is null or "promotions"."per_message_paise" >= 0),
	CONSTRAINT "promotions_estimated_total_paise_check" CHECK ("promotions"."estimated_total_paise" is null or "promotions"."estimated_total_paise" >= 0),
	CONSTRAINT "promotions_prepaid_paise_check" CHECK ("promotions"."prepaid_paise" is null or "promotions"."prepaid_paise" >= 0),
	CONSTRAINT "promotions_billed_total_paise_check" CHECK ("promotions"."billed_total_paise" is null or "promotions"."billed_total_paise" >= 0),
	CONSTRAINT "promotions_refund_paise_check" CHECK ("promotions"."refund_paise" is null or "promotions"."refund_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "waha_send_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" text NOT NULL,
	"sent_on" date NOT NULL,
	"kind" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waha_send_log_gym_day_kind_unique" UNIQUE("gym_id","sent_on","kind"),
	CONSTRAINT "waha_send_log_kind_check" CHECK ("waha_send_log"."kind" in ('reminder', 'activation', 'promo')),
	CONSTRAINT "waha_send_log_count_check" CHECK ("waha_send_log"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "waha_daily_cap" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "transactional_reserve" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "promotion_recipients" ADD CONSTRAINT "promotion_recipients_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_recipients" ADD CONSTRAINT "promotion_recipients_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waha_send_log" ADD CONSTRAINT "waha_send_log_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promotion_recipients_promotion_idx" ON "promotion_recipients" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX "promotion_recipients_promotion_text_status_idx" ON "promotion_recipients" USING btree ("promotion_id","text_status");--> statement-breakpoint
CREATE INDEX "promotions_gym_status_idx" ON "promotions" USING btree ("gym_id","status");--> statement-breakpoint
CREATE INDEX "promotions_status_idx" ON "promotions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "promotions_gym_created_idx" ON "promotions" USING btree ("gym_id","created_at");--> statement-breakpoint
CREATE INDEX "waha_send_log_gym_day_idx" ON "waha_send_log" USING btree ("gym_id","sent_on");--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_waha_daily_cap_check" CHECK ("gyms"."waha_daily_cap" between 1 and 2000);--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_transactional_reserve_check" CHECK ("gyms"."transactional_reserve" between 0 and 2000);