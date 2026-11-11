# Changelog

All notable changes to **Conan Exiles Auction** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Maintainers cut releases with `npm run release -- patch|minor|major` (see
[CONTRIBUTING.md](./CONTRIBUTING.md)), which folds the latest `[Unreleased]`
entries into a dated section automatically.

## [Unreleased]

## [2.0.1] - 2026-11-11

## [2.1.0] - 2026-11-11

### Changed
- resized images for a smaller file size

## [2.0.0] - 2026-11-11

### Added
- A live auction countdown and currency icons with weights on auction details.
- Sign-in protection for guild and auction routes.

### Changed
- Centralized the supported auction currencies and used fixed currency options in the auction form.
- Updated auction creation, bid controls, and the page background with a consistent dark, gold-accented UI.

### Fixed
- Prevented the login view from appearing twice after signing out.
- Mapped legacy currency names to their icon filenames.

## [1.1.0] - 2026-11-10

## [1.0.0] - 2026-11-10

### Added
- Discord OAuth sign-in and Discord server selection.
- Auction creation with descriptions, blind-auction settings, end times, and configurable weighted currencies.
- Auction detail pages with owner-only editing and deletion.
- Real-time bidding with Discord server membership verification, currency-weighted bid validation, and bid history.
- Database-enforced auction ownership and bid rules, plus GitHub Actions deployment for Supabase migrations and the bidding Edge Function.
- The ugliest ui you've ever seen
