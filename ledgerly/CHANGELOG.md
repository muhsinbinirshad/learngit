# Changelog

All notable changes to Ledgerly are recorded here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [1.4.2] - 2025-09-29
### Fixed
- `api`: correct rounding in tax calculation that could be off by one minor unit on some totals.

## [1.4.0] - 2025-09-02
### Added
- `web`: overdue badge on sent invoices past their due date.

## [1.2.0] - 2025-06-18
### Added
- `api`: invoice status transitions (`draft → sent → paid`, with `void`).

## [1.0.0] - 2025-03-20
### Added
- First stable release: invoice totals, line items, multi-currency money core.

## [0.1.0] - 2024-11-11
### Added
- Project scaffold: shared money package, API skeleton, web shell.
