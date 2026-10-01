-- Append-only evidence on registered versions (decision 022).
-- Evidence that arrives after registration records how it came (added_via) and
-- can't be passed off as part of what the author attested to. Evidence an
-- integration submits through an API key waits for the author's approval: it is
-- approved or declined once, and a declined submission never becomes public.
-- Withdrawn records are final, so nothing is added to them.

CREATE FUNCTION authoro_guard_attestation_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  record_status proof_status;
BEGIN
  SELECT status INTO record_status FROM proof_records WHERE work_version_id = NEW.work_version_id;
  IF record_status = 'withdrawn' THEN
    PERFORM authoro_reject('evidence cannot be added to a withdrawn record');
  END IF;
  IF record_status = 'registered' AND NEW.added_via = 'registration' THEN
    PERFORM authoro_reject('the record is registered; evidence added now is added_via author or api');
  END IF;
  IF (record_status IS NULL OR record_status = 'pending_attestation') AND NEW.added_via <> 'registration' THEN
    PERFORM authoro_reject('evidence can be added to a record only once it is registered');
  END IF;
  IF NEW.status NOT IN ('active', 'pending_approval') THEN
    PERFORM authoro_reject('new evidence is active or awaiting approval');
  END IF;
  IF (NEW.status = 'pending_approval') <> (NEW.added_via = 'api') THEN
    PERFORM authoro_reject('evidence submitted through an API key, and only that, awaits the author''s approval');
  END IF;
  IF NEW.reviewed_at IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN
    PERFORM authoro_reject('new evidence has not been reviewed or revoked');
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attestations_insert_rules
  BEFORE INSERT ON attestations
  FOR EACH ROW EXECUTE FUNCTION authoro_guard_attestation_insert();
--> statement-breakpoint

-- Replaces the 0001 rules: added_via joins the immutable fields, and status
-- gains the approval step. Statuses move only forward:
--   pending_approval -> active | declined (final)
--   active <-> disputed, active | disputed -> revoked (final)
CREATE OR REPLACE FUNCTION authoro_guard_attestation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM proof_records
      WHERE work_version_id = OLD.work_version_id AND status <> 'pending_attestation'
    ) THEN
      PERFORM authoro_reject(format('attestation %s belongs to a registered record; revoke it instead', OLD.id));
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.work_version_id IS DISTINCT FROM OLD.work_version_id
    OR NEW.evidence_class IS DISTINCT FROM OLD.evidence_class
    OR NEW.claim_type IS DISTINCT FROM OLD.claim_type
    OR NEW.issuer_id IS DISTINCT FROM OLD.issuer_id
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.signature IS DISTINCT FROM OLD.signature
    OR NEW.added_via IS DISTINCT FROM OLD.added_via
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id AND NEW.submitted_by_user_id IS NOT NULL) THEN
    PERFORM authoro_reject(format('attestation %s is immutable; revoke it and submit a new one', OLD.id));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'declined' THEN
      PERFORM authoro_reject(format('attestation %s was declined and is final', OLD.id));
    END IF;
    IF OLD.status = 'pending_approval' AND NEW.status NOT IN ('active', 'declined') THEN
      PERFORM authoro_reject(format('attestation %s awaits the author''s approval; approve or decline it', OLD.id));
    END IF;
    IF OLD.status <> 'pending_approval' AND NEW.status IN ('pending_approval', 'declined') THEN
      PERFORM authoro_reject(format('attestation %s was already public; revoke it instead', OLD.id));
    END IF;
    IF OLD.status = 'pending_approval' AND NEW.status = 'active' AND EXISTS (
      SELECT 1 FROM proof_records WHERE work_version_id = NEW.work_version_id AND status = 'withdrawn'
    ) THEN
      PERFORM authoro_reject(format('attestation %s belongs to a withdrawn record and cannot be approved', OLD.id));
    END IF;
  END IF;
  IF OLD.reviewed_at IS NOT NULL AND NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    PERFORM authoro_reject(format('the review time of attestation %s cannot change', OLD.id));
  END IF;
  IF (OLD.status = 'pending_approval' AND NEW.status <> 'pending_approval') <> (OLD.reviewed_at IS NULL AND NEW.reviewed_at IS NOT NULL) THEN
    PERFORM authoro_reject('reviewed_at is set when, and only when, evidence awaiting approval is approved or declined');
  END IF;

  IF OLD.status = 'revoked' AND (
    NEW.status <> 'revoked'
    OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
    OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason
    OR (NEW.revoked_by_user_id IS DISTINCT FROM OLD.revoked_by_user_id AND NEW.revoked_by_user_id IS NOT NULL)
  ) THEN
    PERFORM authoro_reject(format('attestation %s is revoked and final', OLD.id));
  END IF;
  IF NEW.status = 'revoked' AND NEW.revoked_at IS NULL THEN
    PERFORM authoro_reject('a revoked attestation needs revoked_at');
  END IF;
  RETURN NEW;
END $$;
