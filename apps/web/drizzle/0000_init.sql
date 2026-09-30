CREATE TYPE "public"."attestation_status" AS ENUM('active', 'revoked', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."evidence_class" AS ENUM('continuous-observed', 'platform-history', 'publisher', 'identity', 'ai', 'self');--> statement-breakpoint
CREATE TYPE "public"."evidence_disclosure" AS ENUM('minimal', 'standard', 'detailed');--> statement-breakpoint
CREATE TYPE "public"."issuer_kind" AS ENUM('authoro', 'platform', 'publisher', 'ai_provider', 'institution', 'identity_provider');--> statement-breakpoint
CREATE TYPE "public"."issuer_verification" AS ENUM('unverified', 'verified', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."proof_status" AS ENUM('pending_attestation', 'registered', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."proof_visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TYPE "public"."signature_status" AS ENUM('unsigned', 'valid', 'invalid', 'unverifiable');--> statement-breakpoint
CREATE TABLE "attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_version_id" uuid NOT NULL,
	"evidence_class" "evidence_class" NOT NULL,
	"claim_type" text NOT NULL,
	"issuer_id" uuid,
	"submitted_by_user_id" text,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"signature" text,
	"signature_status" "signature_status" DEFAULT 'unsigned' NOT NULL,
	"status" "attestation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"revocation_reason" text,
	CONSTRAINT "attestations_payload_hash_format" CHECK ("attestations"."payload_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "attestations_self_has_no_issuer" CHECK ("attestations"."evidence_class" <> 'self' OR "attestations"."issuer_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip_hash" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "author_attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_version_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"statement_version" text NOT NULL,
	"legal_name_hash" text NOT NULL,
	"legal_name_salt" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attestation_hash" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_attestations_workVersionId_userId_unique" UNIQUE("work_version_id","user_id"),
	CONSTRAINT "author_attestations_hash_format" CHECK ("author_attestations"."attestation_hash" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "author_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"website_url" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_profiles_handle_unique" UNIQUE("handle"),
	CONSTRAINT "author_profiles_handle_format" CHECK ("author_profiles"."handle" ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$')
);
--> statement-breakpoint
CREATE TABLE "issuers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "issuer_kind" NOT NULL,
	"domain" text,
	"website_url" text,
	"description" text,
	"verification_status" "issuer_verification" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issuers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "proof_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"work_version_id" uuid NOT NULL,
	"status" "proof_status" DEFAULT 'pending_attestation' NOT NULL,
	"visibility" "proof_visibility" DEFAULT 'public' NOT NULL,
	"evidence_disclosure" "evidence_disclosure" DEFAULT 'standard' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"registered_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_reason" text,
	CONSTRAINT "proof_records_publicId_unique" UNIQUE("public_id"),
	CONSTRAINT "proof_records_workVersionId_unique" UNIQUE("work_version_id"),
	CONSTRAINT "proof_records_registered_at_present" CHECK (("proof_records"."status" = 'pending_attestation') = ("proof_records"."registered_at" IS NULL)),
	CONSTRAINT "proof_records_withdrawn_at_present" CHECK (("proof_records"."status" = 'withdrawn') = ("proof_records"."withdrawn_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "record_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "record_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"proof_record_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"canonical_url" text,
	"author_display_name" text NOT NULL,
	"content_hash" text NOT NULL,
	"text_hash" text,
	"text_canonicalization" text,
	"media_type" text NOT NULL,
	"byte_length" bigint NOT NULL,
	"word_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_versions_workId_versionNumber_unique" UNIQUE("work_id","version_number"),
	CONSTRAINT "work_versions_version_positive" CHECK ("work_versions"."version_number" > 0),
	CONSTRAINT "work_versions_content_hash_format" CHECK ("work_versions"."content_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "work_versions_text_hash_format" CHECK ("work_versions"."text_hash" IS NULL OR "work_versions"."text_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "work_versions_text_canonicalization_present" CHECK (("work_versions"."text_hash" IS NULL) = ("work_versions"."text_canonicalization" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"author_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"work_type" text NOT NULL,
	"canonical_url" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "works_publicId_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_work_version_id_work_versions_id_fk" FOREIGN KEY ("work_version_id") REFERENCES "public"."work_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_attestations" ADD CONSTRAINT "author_attestations_work_version_id_work_versions_id_fk" FOREIGN KEY ("work_version_id") REFERENCES "public"."work_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_attestations" ADD CONSTRAINT "author_attestations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_profiles" ADD CONSTRAINT "author_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_records" ADD CONSTRAINT "proof_records_work_version_id_work_versions_id_fk" FOREIGN KEY ("work_version_id") REFERENCES "public"."work_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_proof_record_id_proof_records_id_fk" FOREIGN KEY ("proof_record_id") REFERENCES "public"."proof_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_versions" ADD CONSTRAINT "work_versions_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_author_profile_id_author_profiles_id_fk" FOREIGN KEY ("author_profile_id") REFERENCES "public"."author_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attestations_work_version_id_index" ON "attestations" USING btree ("work_version_id");--> statement-breakpoint
CREATE INDEX "attestations_issuer_id_index" ON "attestations" USING btree ("issuer_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_id_created_at_index" ON "audit_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_created_at_index" ON "audit_events" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "author_profiles_user_id_index" ON "author_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "proof_records_status_index" ON "proof_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "record_events_proof_record_id_created_at_index" ON "record_events" USING btree ("proof_record_id","created_at");--> statement-breakpoint
CREATE INDEX "work_versions_content_hash_index" ON "work_versions" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "work_versions_text_hash_index" ON "work_versions" USING btree ("text_hash");--> statement-breakpoint
CREATE INDEX "works_owner_id_index" ON "works" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "works_author_profile_id_index" ON "works" USING btree ("author_profile_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");