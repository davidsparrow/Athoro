-- Visibility, embargoes and evidence presets (decision 026).
-- Visibility can decrease disclosure, but never erase provenance:
-- * published_at records when anyone but the owner could first see a record's
--   details. It is set once and never cleared, so a record that has been public
--   can be restricted but never pass for private-from-the-start.
-- * An embargo is a scheduled release of a private record that was never
--   published (the CHECK in 0008).
-- * Every change of visibility, embargo or evidence preset on a registered
--   record appends a public record event here, in the database, so no code path
--   can change what readers see without leaving a trace.

-- Records registered before published_at existed were published when registered,
-- unless private. Withdrawn records are otherwise final, so the guard is paused
-- for this one backfill.
ALTER TABLE proof_records DISABLE TRIGGER proof_records_forward_only;
--> statement-breakpoint
UPDATE proof_records SET published_at = registered_at
WHERE status <> 'pending_attestation' AND visibility <> 'private';
--> statement-breakpoint
ALTER TABLE proof_records ENABLE TRIGGER proof_records_forward_only;
--> statement-breakpoint

ALTER TABLE proof_records ADD CONSTRAINT proof_records_published_when_visible
  CHECK (status = 'pending_attestation' OR visibility = 'private' OR published_at IS NOT NULL);
--> statement-breakpoint
ALTER TABLE proof_records ADD CONSTRAINT proof_records_published_after_registration
  CHECK (published_at IS NULL OR (registered_at IS NOT NULL AND published_at >= registered_at));
--> statement-breakpoint

-- Replaces the 0001 rules, adding the publication time.
CREATE OR REPLACE FUNCTION authoro_guard_proof_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'pending_attestation' THEN
      PERFORM authoro_reject(format('proof record %s is registered and cannot be deleted', OLD.public_id));
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.public_id IS DISTINCT FROM OLD.public_id
    OR NEW.work_version_id IS DISTINCT FROM OLD.work_version_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    PERFORM authoro_reject(format('the identity of proof record %s cannot change', OLD.public_id));
  END IF;
  IF OLD.status = 'withdrawn' THEN
    PERFORM authoro_reject(format('proof record %s is withdrawn and final', OLD.public_id));
  END IF;
  IF OLD.status = 'registered' AND NEW.status = 'pending_attestation' THEN
    PERFORM authoro_reject(format('proof record %s cannot return to pending', OLD.public_id));
  END IF;
  IF OLD.status = 'pending_attestation' AND NEW.status = 'withdrawn' THEN
    PERFORM authoro_reject(format('proof record %s was never registered; delete it instead', OLD.public_id));
  END IF;
  IF OLD.registered_at IS NOT NULL AND NEW.registered_at IS DISTINCT FROM OLD.registered_at THEN
    PERFORM authoro_reject(format('the registration time of %s cannot change', OLD.public_id));
  END IF;
  IF OLD.published_at IS NOT NULL AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    PERFORM authoro_reject(format('%s has been published; its publication time cannot change', OLD.public_id));
  END IF;
  IF OLD.published_at IS NULL AND NEW.published_at IS NOT NULL AND NEW.visibility = 'private' THEN
    PERFORM authoro_reject(format('%s stays private, so it is not being published', OLD.public_id));
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- The public history of every visibility, embargo and preset change after
-- registration. The actor is whoever the application names in the
-- transaction-local setting authoro.actor (NULL for scheduled releases).
CREATE FUNCTION authoro_log_proof_record_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor text := nullif(current_setting('authoro.actor', true), '');
BEGIN
  IF OLD.status = 'pending_attestation' THEN
    RETURN NULL;
  END IF;
  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    IF OLD.embargo_until IS NOT NULL AND NEW.embargo_until IS NULL AND NEW.visibility <> 'private' THEN
      INSERT INTO record_events (proof_record_id, event_type, actor_user_id, data)
      VALUES (NEW.id, 'embargo-lifted', actor, jsonb_build_object(
        'scheduledFor', OLD.embargo_until,
        'early', NEW.published_at < OLD.embargo_until,
        'to', NEW.visibility));
    ELSE
      INSERT INTO record_events (proof_record_id, event_type, actor_user_id, data)
      VALUES (NEW.id, 'visibility-changed', actor, jsonb_build_object(
        'from', OLD.visibility,
        'to', NEW.visibility,
        'firstPublished', OLD.published_at IS NULL AND NEW.published_at IS NOT NULL));
    END IF;
  ELSIF NEW.embargo_until IS DISTINCT FROM OLD.embargo_until
    OR NEW.embargo_shows_fingerprint IS DISTINCT FROM OLD.embargo_shows_fingerprint THEN
    INSERT INTO record_events (proof_record_id, event_type, actor_user_id, data)
    VALUES (NEW.id, 'embargo-changed', actor, jsonb_build_object(
      'from', OLD.embargo_until,
      'to', NEW.embargo_until,
      'fingerprintShown', NEW.embargo_shows_fingerprint));
  END IF;
  IF NEW.evidence_disclosure IS DISTINCT FROM OLD.evidence_disclosure THEN
    INSERT INTO record_events (proof_record_id, event_type, actor_user_id, data)
    VALUES (NEW.id, 'evidence-disclosure-changed', actor, jsonb_build_object(
      'from', OLD.evidence_disclosure,
      'to', NEW.evidence_disclosure));
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER proof_records_log_changes
  AFTER UPDATE ON proof_records
  FOR EACH ROW EXECUTE FUNCTION authoro_log_proof_record_change();
