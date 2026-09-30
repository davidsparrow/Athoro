-- Registry integrity rules, enforced by the database rather than application code.
-- A registered record is never silently rewritten: corrections, revocations and
-- withdrawals are new rows or one-way status changes.

CREATE FUNCTION authoro_reject(message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'authoro: %', message USING ERRCODE = 'integrity_constraint_violation';
END $$;
--> statement-breakpoint

-- Work versions are editable only while their proof record awaits attestation.
CREATE FUNCTION authoro_guard_work_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM proof_records
    WHERE work_version_id = OLD.id AND status <> 'pending_attestation'
  ) THEN
    PERFORM authoro_reject(format('work version %s is registered and immutable; register a new version instead', OLD.id));
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER work_versions_immutable_when_registered
  BEFORE UPDATE OR DELETE ON work_versions
  FOR EACH ROW EXECUTE FUNCTION authoro_guard_work_version();
--> statement-breakpoint

-- Proof records: identity never changes; status only moves forward
-- (pending_attestation -> registered -> withdrawn); only pending records can be deleted.
CREATE FUNCTION authoro_guard_proof_record() RETURNS trigger LANGUAGE plpgsql AS $$
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
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER proof_records_forward_only
  BEFORE UPDATE OR DELETE ON proof_records
  FOR EACH ROW EXECUTE FUNCTION authoro_guard_proof_record();
--> statement-breakpoint

-- Attestation claims are immutable. Status may change (disputed <-> active, or
-- -> revoked, which is final), signatures may be re-evaluated, and user
-- references may be cleared by ON DELETE SET NULL.
CREATE FUNCTION authoro_guard_attestation() RETURNS trigger LANGUAGE plpgsql AS $$
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
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id AND NEW.submitted_by_user_id IS NOT NULL) THEN
    PERFORM authoro_reject(format('attestation %s is immutable; revoke it and submit a new one', OLD.id));
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
--> statement-breakpoint
CREATE TRIGGER attestations_claims_immutable
  BEFORE UPDATE OR DELETE ON attestations
  FOR EACH ROW EXECUTE FUNCTION authoro_guard_attestation();
--> statement-breakpoint

-- Append-only tables.
CREATE FUNCTION authoro_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM authoro_reject(format('%s is append-only (%s rejected)', TG_TABLE_NAME, TG_OP));
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER author_attestations_append_only
  BEFORE UPDATE OR DELETE ON author_attestations
  FOR EACH ROW EXECUTE FUNCTION authoro_append_only();
--> statement-breakpoint
CREATE TRIGGER record_events_append_only
  BEFORE UPDATE OR DELETE ON record_events
  FOR EACH ROW EXECUTE FUNCTION authoro_append_only();
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION authoro_append_only();
