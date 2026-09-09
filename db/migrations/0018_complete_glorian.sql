ALTER TABLE "promotions" ADD COLUMN "image_bytes" "bytea";--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "image_stored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "image_deleted_at" timestamp with time zone;