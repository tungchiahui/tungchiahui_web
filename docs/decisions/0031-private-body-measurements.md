# ADR 0031 — Owner-only unified body measurements

- Status: Accepted
- Date: 2026-11-12
- Authorization: Owner approved unified S400/manual health management and versioned JSON exchange.
- Partially supersedes: ADR 0021 public weight-loss measurement reads and dataset-wide editing.

## Decision

Keep locale-aware `/weight-loss` public as an entry page. Personal plans and actual measurements are owner-only,
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

## Unified storage and execution

Migration 0014 adds normalized app.body_measurements plus isolated health plan, snapshot and sync
state tables. Data backfill uses validated TypeScript inside one transaction, retains the original
JSONB, freezes its writes, preserves date-only Beijing midnight and complete custom target metadata.
Migration 0015 adds health_sync to the existing durable application-job enum. The content-worker
executes imports with source-only row policies and column grants. Its isolated read-only directory
lives under the managed production dataRoot, separate from exporter credentials and all web slots.
Polling defaults disabled until the Owner authorizes one-time producer configuration and activation.

Formal version-1 website JSON supports validated preview and revision-checked atomic merge. Raw
source fields, independent annotations and plan metadata retain their provenance. Automatic source
metrics remain protected when merging files. New absent automatic rows require raw-source identity
and metric reconciliation. Old CSV utilities remain available as offline compatibility code.

The compatibility release SHA is explicitly recognized by deployment compatibility checks. New web
images advertise health-data-versions=1. Migration and rollback fail closed when the retained release
cannot serve owner-only unified data. Backup/PITR and restore drills cover all added PostgreSQL data.
Operational details and recovery validation are in ../operations/body-measurements.md.

## 2026-11-14 — Owner-authorized private plan and dashboard revision

The Owner approved hiding personal plans from anonymous and non-owner visitors, replacing the
fixed fortnightly target table with stage plans and measurement-based period reviews, and using
January 10, 2027 at 80 kg as the next checkpoint. August 14 through October 25, 2026 is a 90 kg
maintenance interval. Weight loss resumes from 90 kg on October 26. The 75 kg long-term target has
no scheduled end date. This revision replaces the earlier public-static-plan presentation decision.

The authenticated snapshot response adds a validated plan and localized `HealthPlan` messages.
The public next-intl payload excludes this namespace. Existing snapshot fields, database schema,
version-1 JSON exchange, source protection and account boundaries remain compatible. Original plan
overrides remain stored and exported. The revised schedule takes precedence from August 14 onwards,
while earlier explicit custom targets remain effective. Legacy default plan generation is retained
for historical data migration and offline compatibility.

Charts default to 14-calendar-day local weighted regression over daily means, with optional
7/30-day windows and observed daily points. Bounded cubic segments join missing intervals with
explicitly labelled dashed estimates. Daily and seven-calendar-day means remain available.
Estimated values are display-only and never contribute to persistence, exchange or statistics.
Weekly/monthly statistics give each valid daily mean equal weight. The private dashboard includes
metric sparklines, weekly change bars, a measurement calendar and accessible record dialogs.
Verification covers authorization, anonymous HTML/RSC, four locales, time boundaries, missing values,
excluded records, smooth-path bounds, responsive layout and the retained JSON/annotation workflows.
Operational behavior and rollback implications are documented in body-measurements.md.
