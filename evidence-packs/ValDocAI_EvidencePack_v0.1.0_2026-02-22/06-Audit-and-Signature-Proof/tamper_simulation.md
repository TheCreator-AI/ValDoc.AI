# Tamper Simulation (Staging Only)

## Goal
Demonstrate audit chain verification failure when an event is modified out-of-band.

## Procedure
1. Baseline chain verification should pass.
2. Modify one audit record directly in staging test DB.
3. Re-run verify-chain endpoint/report.

## Expected
- Verification fails.
- First broken event id is reported.
- Incident/audit follow-up logged.
