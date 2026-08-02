# Changelog

All notable changes to ITMS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Asset buyouts.** Record an employee's purchase of a company asset (systems,
  mobiles, network devices) via a new append-only `asset_purchases` ledger and
  `POST /api/purchases`. A **Buyout** action in the employee profile (available
  for both active and ex-employees) captures sale price, date, invoice, and a
  buyer-name snapshot in one transaction; the asset moves to a new `sold` status
  and the sale appears as a **Purchased** event on the asset-history timeline.
- **Consumable re-issuance report.** New **Re-issuance** tab in Reports flags
  employees repeatedly issued the same low-value accessory (headset, mouse,
  adapter, …) within a selectable period, with period/threshold filters, PDF
  export, and highlighting for 3+ issuances (`GET /api/reports/reissuance`).
- **Asset-lifecycle design reference** (`docs/asset-lifecycle-design.md`) mapping
  the offboarding/audit requirements onto the existing schema and specifying the
  buyout ledger and integrity guardrails.

### Fixed
- Buyout events now appear on the asset-history timeline — they were written with
  the plural table name (`mobiles`) instead of the singular type (`mobile`) the
  timeline queries, so they never showed.

### Changed
- Refactored the SIM, Mobile, System, and Network device pages to deduplicate
  label maps, shared constants, and repeated markup (behavior-preserving).
- Pruned unused default `React` imports across the frontend (automatic JSX
  runtime).
