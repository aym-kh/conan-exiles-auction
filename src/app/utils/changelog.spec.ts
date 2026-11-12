import { parseLatestChangelogRelease } from './changelog';

describe('parseLatestChangelogRelease', () => {
  it('skips unreleased notes and returns the newest dated release', () => {
    const release = parseLatestChangelogRelease(`# Changelog

## [Unreleased]
- Work in progress

## [3.0.0] - 2026-11-12

### Added
- A new feature.

### Fixed
- A reported issue.

## [2.0.0] - 2026-11-11
`);

    expect(release).toEqual({
      version: '3.0.0',
      date: '2026-11-12',
      sections: [
        { title: 'Added', items: ['A new feature.'] },
        { title: 'Fixed', items: ['A reported issue.'] },
      ],
    });
  });

  it('returns null when the changelog has no dated releases', () => {
    expect(parseLatestChangelogRelease('## [Unreleased]\n- Work in progress')).toBeNull();
  });
});
