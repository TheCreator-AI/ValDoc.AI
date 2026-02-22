# Security Controls Overview

## Threat Model Summary
- Threat actors: authenticated users, malicious insiders, external attackers.
- Primary risks: unauthorized access, cross-org data leakage, record tampering.

## Implemented Controls (Summary)
- RBAC enforced server-side on all protected endpoints.
- Organization scoping enforced in data access layer.
- Append-only audit trail with hash-chain verification.
- E-signatures with re-authentication and content hash binding.
- State-machine lifecycle with approved-version immutability.
- File validation: allowlist, signature checks, size limits, malware scan hook.
- Security headers, CSRF protections, secure session handling.
