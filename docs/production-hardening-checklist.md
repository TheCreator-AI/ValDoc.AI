# Production Hardening Checklist

## Scope
Deployment controls required in addition to application code for GMP/Part 11-aligned operation.

## Network and Transport
- Enforce TLS 1.2+ at ingress.
- Enable HSTS on production domains.
- Restrict inbound network access to required ports.
- Place admin surfaces behind VPN or IP allowlisting where feasible.

## Identity and Access
- Enforce MFA for privileged roles (`ADMIN`, `APPROVER`) in production.
- Implement formal user access lifecycle (joiner/mover/leaver).
- Run periodic access reviews and retain signed attestations.

## App Security Controls
- CSRF same-origin guard enabled for unsafe authenticated API methods.
- Rate limiting enabled for login, signing, uploads, and evidence export.
- Use distributed rate limiting in production (`RATE_LIMIT_BACKEND=redis`) or enforce equivalent controls at API gateway/WAF.
- Secure response headers enabled (CSP, X-Frame-Options, nosniff, etc.).
- Startup config validation blocks insecure OpenSearch flags and default MinIO credentials in production.

## Secrets and Keys
- Store secrets in a managed secret store/KMS.
- Rotate session/JWT and backup encryption keys on policy schedule.
- Never store secrets in source control.

## Data Protection
- Encrypt database and storage volumes at rest.
- Use private storage paths and least-privilege IAM/service accounts.
- Validate backup encryption and restore verification on schedule.

## Audit and Monitoring
- Forward audit logs to centralized immutable logging/SIEM.
- Monitor denied auth/authz events and lockout rates.
- Alert on audit-chain verification failure.

## Validation and Change Control
- Execute IQ/OQ protocols on each major validated release.
- Record release entry with risk impact and approval signature.
- Maintain traceability and objective evidence package exports.

## Security Assurance
- Run CI gates: tests, lint/typecheck, dependency audit, SAST, secrets scan.
- Perform periodic external penetration testing and remediate findings.
- Document deviations/CAPA and closure evidence.
