CREATE TABLE "proof_metrics_daily" (
	"proof_record_id" uuid NOT NULL,
	"day" date NOT NULL,
	"mark_impressions" integer DEFAULT 0 NOT NULL,
	"mark_clicks" integer DEFAULT 0 NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"verifications" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "proof_metrics_daily_proof_record_id_day_pk" PRIMARY KEY("proof_record_id","day")
);
--> statement-breakpoint
ALTER TABLE "proof_metrics_daily" ADD CONSTRAINT "proof_metrics_daily_proof_record_id_proof_records_id_fk" FOREIGN KEY ("proof_record_id") REFERENCES "public"."proof_records"("id") ON DELETE cascade ON UPDATE no action;