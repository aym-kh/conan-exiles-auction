# Contributing to Conan Exiles Auction

First off, thanks for wanting to add to this project! This project is only as good
as the improvements the community shares. Everything you need to contribute is in
this short guide.

## Table of contents

1. [Local development setup](#local-development-setup)
2. [Submitting the pull request](#submitting-the-pull-request)

## Local development setup

```bash
# Clone the repository
git clone [https://github.com/aym-kh/conan-exiles-auction](https://github.com/aym-kh/conan-exiles-auction)

# Navigate to directory
cd conan-exlies-auction

# Install dependencies
npm install

# Start development server
npm start

Navigate to http://localhost:4200/
```

## Submitting the pull request

1. **Fork** the repository and create a branch.
2. **Open the PR** with:
   - A short title, e.g. `Add new currency`
   - Screenshots or clip links showing the new feature (if available)

A maintainer or a reviewer will load your entry, sanity-check the code, and merge.

## Cutting a release (maintainers)

Releases are automated through `scripts/release.mjs`:

```bash
# Preview the whole release pipeline without touching anything
npm run release -- patch --dry-run

# Do the real thing
npm run release -- patch # or minor / major
```

The script will:

1. Verify the working tree is clean (abort otherwise)
2. Run the test suite
3. Bump `package.json` and `package-lock.json` to the next version
4. Fold the `CHANGELOG.md` `[Unreleased]` section into a dated one
   (`## [Unreleased]` becomes `## [x.y.z] - <date>`)
5. Commit (`chore(release): x.y.z`), create the annotated `vx.y.z` tag and
   push both with `git push --follow-tags`

The `v*` tag push is what triggers the "Deploy to Netlify on Release Tag"
workflow, which builds the production bundle and ships it to Netlify — so
once the script finishes, watch the Actions run for the deploy result.

Before releasing: make sure the version-relevant content actually lives
under `CHANGELOG.md`'s `[Unreleased]` heading. Entries added under other
sections are not folded.

---
