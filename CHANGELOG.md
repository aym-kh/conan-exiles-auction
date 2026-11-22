# Changelog

All notable changes to **Conan Exiles Auction** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Maintainers cut releases with `npm run release -- patch|minor|major` (see
[CONTRIBUTING.md](./CONTRIBUTING.md)), which folds the latest `[Unreleased]`
entries into a dated section automatically.

## [Unreleased]

### Fixed
- Changed the changelog (what's new) window size so it's not blocking the login button 

## [3.2.0] - 2026-11-22

### Added
- Multi-item auctions with individually named and described items, item-specific bidding, and item-specific images.
- Open, anonymous, and sealed bidding formats.
- Sealed offers that bidders can revise until the auction closes, followed by anonymized result reveal after closing.
- A completed sealed-auctions archive with pagination in the guild dashboard.
- Auction and item image uploads, public image galleries, thumbnails, image removal, and upload progress feedback.
- Staged image uploads for authenticated users before an auction is saved.
- Discord server-owner webhook configuration with ownership and webhook validation, a test notification, and the ability to disable notifications.
- Bot-free Discord auction notifications for new auctions, eligible bids, and auctions ending within one hour.
- Durable notification outbox with retries, delivery status tracking, and duplicate-event protection.
- Scheduled ending-soon reminder delivery through Supabase Vault and `pg_cron`.

### Changed
- Redesigned the auction form into a responsive layout, with a wider multi-item mode and side-by-side item and settings panels.
- Updated auction details and guild dashboards to support item selection, item-specific bid history, and completed sealed-auction browsing.
- Replaced the legacy blind-auction setting with explicit `open`, `anonymous`, and `sealed` bidding formats.
- Locked bidding format changes after the first bid is placed.
- Bidding is now validated and compared independently for each multi-item auction item.
- Discord notification embeds now include auction details, item and currency information, bidder visibility rules, and attached images.
- Discord notifications now use a private, server-side outbox and Edge Function dispatch instead of direct delivery from the browser.

### Fixed
- Sealed bids are hidden while active and remain excluded from live Discord notifications.
- Removed direct public write access to the notification settings and outbox tables.
- Added image upload size, MIME-type, and attachment ownership restrictions.

## [3.1.1] - 2026-11-12

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
