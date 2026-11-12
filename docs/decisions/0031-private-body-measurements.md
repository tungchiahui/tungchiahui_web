# ADR 0031 — Owner-only unified body measurements

- Status: Accepted
- Date: 2026-11-12
- Authorization: Owner approved unified S400/manual health management and versioned JSON exchange.
- Partially supersedes: ADR 0021 public weight-loss measurement reads and dataset-wide editing.

## Decision

Keep locale-aware `/weight-loss` and its static plan public. Actual measurements are owner-only,
including historical JSONB. Private reads and writes use independent control-api and the current
`site_session` account authentication with strict owner role checks. Anonymous SSR receives no
measurements. Public dataset reads deny `weight_loss`; technical-roadmap behavior stays compatible.

Ship the privacy compatibility release before the unified schema release. The retained release
reads the private `app.weight_loss_private_compat` projection once present and otherwise reads the
old dataset through the authenticated control-api. The projection is created by the later additive
migration. The later migration freezes legacy writes. This release provides a private rollback UI
for the unified records without reverting the authoritative store to obsolete JSONB.

Versioned website JSON is the formal exchange format. SmartScaleConnect 0.4.2 remains independent
and its export uses a separate validated ingestion contract. Health data and export files remain
outside Git. Production credentials and activation follow existing server-managed release policy.
