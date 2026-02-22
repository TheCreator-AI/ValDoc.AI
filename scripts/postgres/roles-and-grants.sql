-- Postgres role hardening for ValDoc.AI enterprise deployment
-- Execute with a privileged migration/admin account after schema migration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'valdoc_app') THEN
    CREATE ROLE valdoc_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'valdoc_admin') THEN
    CREATE ROLE valdoc_admin LOGIN;
  END IF;
END
$$;

-- Baseline app permissions
GRANT USAGE ON SCHEMA public TO valdoc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO valdoc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO valdoc_app;

-- Admin role gets management-level capabilities, but still no audit mutation.
GRANT USAGE ON SCHEMA public TO valdoc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO valdoc_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO valdoc_admin;

-- Append-only posture: app/admin roles cannot update/delete immutable audit/signature tables.
REVOKE UPDATE, DELETE ON TABLE "AuditEvent" FROM valdoc_app;
REVOKE UPDATE, DELETE ON TABLE "AuditEventDetail" FROM valdoc_app;
REVOKE UPDATE, DELETE ON TABLE "ElectronicSignature" FROM valdoc_app;

REVOKE UPDATE, DELETE ON TABLE "AuditEvent" FROM valdoc_admin;
REVOKE UPDATE, DELETE ON TABLE "AuditEventDetail" FROM valdoc_admin;
REVOKE UPDATE, DELETE ON TABLE "ElectronicSignature" FROM valdoc_admin;

-- Ensure future tables/sequences inherit grants for both roles.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO valdoc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO valdoc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO valdoc_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO valdoc_admin;
