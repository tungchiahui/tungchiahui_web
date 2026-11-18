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

## 2026-11-17 — Private reference-profile compatibility release

The Owner authorized a security update followed by metric assessments and a revised maintenance
plan. Before enabling the private reference profile, publish optional HEALTH_REFERENCE_PROFILE_JSON
support to both active and retained host generations. The canonical host-local configuration is
validated at control-api startup and injected only into that service. Local development reads the
ignored .env.local key. Tests use a synthetic profile. Authenticated snapshots may include the
profile while retained clients accept the additional optional field. Actual profile values remain
outside Git. The subsequent UI release documents its assessment references and target schedule.

## 2026-11-17 — Dynamic references and dated maintenance plan

The Owner approved metric assessments, using applicable Chinese standards and verifiable
personalized references, and specified 80 kg on January 10, 2027, 70 kg on March 20, 2027,
followed by indefinite maintenance at 70 kg. The March checkpoint is presented as a challenge
target. The existing 90 kg maintenance interval and earlier custom-target precedence remain.

The server-authored private plan adds an optional checkpoint and maintenance flag. The same
authenticated response includes a validated reference profile supplied by the Owner. This
profile comes from the optional host-local `HEALTH_REFERENCE_PROFILE_JSON` configuration,
validated at control-api startup and exposed only to that service. Birth dates remain outside
Git. Local development reads the same key from the ignored `.env.local`, while integration tests
use a synthetic profile. Actual measurements remain authoritative in PostgreSQL. The optional response fields accept retained snapshots from older
control-api versions. Version-1 JSON exchange and the measurement schema retain their contracts.

Assessments use the measurement's Beijing date to calculate age and prioritize the same row's
height over the authored reference height. Chinese adult BMI and waist classifications and the
Chinese Medical Association adult body-fat reference supply categorical assessments. General
adult body-water and resting-heart-rate references carry their own attribution. Resting energy
expenditure is dynamically estimated with Mifflin–St Jeor from same-record weight, height, sex
and measurement-date age. Its result is presented as a formula comparison.

Device-dependent muscle, skeletal-muscle, bone, protein, visceral-fat and body-score values use
the preceding 30 calendar days of personal daily means from the same source/device. At least
three valid days are required. Comparisons are explicitly labelled as personal-baseline
comparisons. The current day, future days, NULL values and excluded records are omitted.
Categorical physique codes and height remain recorded information. Muscle/protein percentages
use paired values from the same row. These calculations are display-only.

The source review found that Xiaomi confirms individualized reference values but does not
publish its complete grading algorithm. The S400 firmware research linked in the operational
documentation estimates composition using impedance data, which the existing normalized
export does not supply. The website preserves the imported Xiaomi values and attributes each
assessment to its actual reference. Detail dialogs expose boundaries or reference values and
support four locales, mobile bottom sheets, desktop dialogs, dark mode and keyboard focus.

## 2026-11-17 — Composition percentages and report-derived references

The Owner approved percentage-first muscle/protein cards, details showing both percentage and
mass, and taller interactive trend charts. Display-only metric keys derive percentages from each
valid same-row mass/weight pair before aggregation. Persisted measurements and version-1 exchange
retain their existing schema. Both units use the same mass assessment, converting its boundaries
with the selected measurement's weight.

The optional private profile may include a validated personal Xiaomi report reference with its
capture date, age, height, sex, weight and observed boundaries. A matching measurement-date age,
effective height and sex permit use of that reference. Muscle mass uses the captured mass bounds.
Protein bounds are converted once from the report's percentage and weight into mass anchors.
The anchored-mass policy is an explicit product choice. Xiaomi's complete proprietary algorithm
remains unpublished and source rounding can affect the displayed final digit. Mismatched profile
parameters fall back to the existing baseline/formula. Report-derived visceral-fat and basal-energy
bands use their captured boundaries. Basal-energy details separately retain the dated formula prediction.

The extension remains within the existing private configuration key. Retained profile validators
strip unknown nested fields and continue accepting it. Current validators check the full reference,
and actual profile data remains outside Git and is injected only into control-api. Existing Owner
authorization, no-store responses and rollback storage contracts remain in effect.

Main charts use taller responsive plots and dynamic axis ticks. Pointer, touch and keyboard
inspection exposes dates, actual curve values, plan targets and differences using the existing
targetAt schedule. Future plan dates have no actual value, while bounded missing intervals retain
their explicit estimate labels. This is client-side presentation over the authenticated snapshot.

## 2026-11-18 — Fat mass display and revised checkpoint

The Owner requested body-fat details in both percentage and kg and revised the January 10, 2027
checkpoint to 77.5 kg. This checkpoint supersedes the prior 80 kg decision. March 20, 2027 remains
the 70 kg challenge followed by indefinite 70 kg maintenance under the existing schedule.

Display-only fatMass is computed from each valid same-record weight and body-fat percentage before
aggregation. Both units share the existing body-fat assessment, converting percentage reference
bounds with that measurement's weight. Details expose both values and unit-switchable references
and trends. Missing weight leaves the valid percentage available while fat mass is unavailable.
Existing storage, version-1 exchange, private profile configuration and authorization contracts apply.
