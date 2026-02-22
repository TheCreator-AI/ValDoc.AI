# Data Classification

## Data Stored
- User accounts, roles, and auth/audit events.
- Equipment records, templates, generated documents, signatures.
- Uploaded files and generated exports with integrity hashes.

## Data Not Stored (Expected)
- Raw plaintext secrets.
- Customer credentials for external systems.
- Payment card data.

## Handling Notes
- Use least privilege access.
- Keep backups encrypted and access-controlled.
- Apply retention + legal hold policies.
