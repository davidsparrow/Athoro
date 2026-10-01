ALTER TABLE "proof_records" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proof_records" ADD COLUMN "embargo_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proof_records" ADD COLUMN "embargo_shows_fingerprint" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "proof_records_embargo_until_index" ON "proof_records" USING btree ("embargo_until");--> statement-breakpoint
ALTER TABLE "proof_records" ADD CONSTRAINT "proof_records_embargo_private" CHECK ("proof_records"."embargo_until" IS NULL OR ("proof_records"."visibility" = 'private' AND "proof_records"."published_at" IS NULL AND "proof_records"."status" <> 'withdrawn'));