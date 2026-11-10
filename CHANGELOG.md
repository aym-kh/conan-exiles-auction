# Changelog

All notable changes to **Conan Exiles Auction** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Maintainers cut releases with `npm run release -- patch|minor|major` (see
[CONTRIBUTING.md](./CONTRIBUTING.md)), which folds the latest `[Unreleased]`
entries into a dated section automatically.

## [Unreleased]

### Added
- Discord OAuth sign-in and Discord server selection.
- Auction creation with descriptions, blind-auction settings, end times, and configurable weighted currencies.
- Auction detail pages with owner-only editing and deletion.
- Real-time bidding with Discord server membership verification, currency-weighted bid validation, and bid history.
- Database-enforced auction ownership and bid rules, plus GitHub Actions deployment for Supabase migrations and the bidding Edge Function.
- The ugliest ui you've ever seen
