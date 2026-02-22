# OpenSearch Production Hardening

This app treats indexing infrastructure as security-sensitive.

## Required Controls
- Enable the OpenSearch security plugin in production.
- Use TLS for all index traffic (`OPENSEARCH_URL=https://...`).
- Use a dedicated least-privilege service account for indexing (do not use admin).
- Store OpenSearch credentials in a secrets manager (not in source code or committed files).

## Network Boundaries
- Place OpenSearch on a private network segment/VPC subnet.
- Allow inbound access only from the application service.
- Do not expose OpenSearch to the public internet.
- Restrict egress from app containers/hosts to required destinations only.

## Runtime Configuration
- `ENABLE_OPENSEARCH=true`
- `OPENSEARCH_SECURITY_DISABLED=false`
- `OPENSEARCH_URL=https://<private-opensearch-endpoint>:9200`
- `OPENSEARCH_USERNAME=<least-privilege-index-user>`
- `OPENSEARCH_PASSWORD=<secret from secrets manager>`

Startup validation fails in production when these constraints are not met.

## Recommended Role Scope
Create an indexer role/user with only:
- index read/write for app-owned index patterns
- no cluster-admin privileges
- no security-admin privileges

## Secrets Management
- Use platform secret injection (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, Vault, Kubernetes secrets).
- Rotate credentials periodically and on incident response.
- Keep secrets out of `.env.example`, code, docs, and logs.
