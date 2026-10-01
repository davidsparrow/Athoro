CREATE TYPE "public"."evidence_channel" AS ENUM('registration', 'author', 'api');--> statement-breakpoint
ALTER TYPE "public"."attestation_status" ADD VALUE 'pending_approval';--> statement-breakpoint
ALTER TYPE "public"."attestation_status" ADD VALUE 'declined';--> statement-breakpoint
ALTER TABLE "attestations" ADD COLUMN "added_via" "evidence_channel" DEFAULT 'registration' NOT NULL;--> statement-breakpoint
ALTER TABLE "attestations" ADD COLUMN "reviewed_at" timestamp with time zone;