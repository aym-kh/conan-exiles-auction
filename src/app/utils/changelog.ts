import { ChangelogRelease, ChangelogSection } from "../types";

export function parseLatestChangelogRelease(
  changelog: string,
): ChangelogRelease | null {
  const releaseHeading = /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\s*$/gm;
  const match = releaseHeading.exec(changelog);
  if (!match || match.index === undefined) return null;

  const bodyStart = match.index + match[0].length;
  const nextHeading = changelog.indexOf('\n## [', bodyStart);
  const body = changelog.slice(bodyStart, nextHeading === -1 ? undefined : nextHeading);
  const sections: ChangelogSection[] = [];
  let currentSection: ChangelogSection | undefined;

  for (const line of body.split(/\r?\n/)) {
    const sectionHeading = /^###\s+(.+)$/.exec(line);
    if (sectionHeading) {
      currentSection = { title: sectionHeading[1], items: [] };
      sections.push(currentSection);
    } else {
      const item = /^\s*-\s+(.+)$/.exec(line);
      if (item && currentSection) currentSection.items.push(item[1]);
    }
  }

  return {
    version: match[1],
    date: match[2],
    sections,
  };
}
