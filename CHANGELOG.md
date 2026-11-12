# Changelog

All notable changes to **Conan Exiles Auction** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Maintainers cut releases with `npm run release -- patch|minor|major` (see
[CONTRIBUTING.md](./CONTRIBUTING.md)), which folds the latest `[Unreleased]`
entries into a dated section automatically.

## [Unreleased]

### Fixed
- Resolve legacy currency names to their canonical icon filenames so image requests don't fall through to the app page.

## [3.1.0] - 2026-11-12

### Added
- Added a reusable title component for the server selector and auction dashboard.
- Added a home-screen "What's New?" panel with the latest release notes and a link to the full changelog.
- Restored the auction owner's Edit and Delete actions on auction details.
- Added Eldarium as an accepted auction currency.
- Display currency icons beside currency names in auction details and bid summaries.

## [3.0.0] - 2026-11-12

### Added
- Discord server member and presence counts, plus server feature indicators in the server details panel.
- Live countdowns in the guild dashboard's auction list.

### Changed
- Reworked server selection, the guild dashboard, and auction details into game-inspired split views.
- Applied the reusable slate, gold-frame, and stone-grain theme to the updated panels and auction form, removing their previous imagery.
- Show the guest welcome section only when the user is signed out.
- Added explicit development and production environment configurations, with release builds pinned to production.

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
