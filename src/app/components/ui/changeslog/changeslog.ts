import { Component, OnInit, signal } from '@angular/core';
import { parseLatestChangelogRelease } from '../../../utils/changelog';
import { Button } from '../button/button';
import { ChangelogRelease } from '../../../types';

@Component({
  imports: [
    Button,
  ],
  selector: 'app-changeslog',
  styleUrl: './changeslog.css',
  templateUrl: './changeslog.html',
})
export class Changeslog implements OnInit {

  protected readonly isWhatsNewOpen = signal(false);
  protected readonly isChangelogLoading = signal(false);
  protected readonly changelogError = signal<string | null>(null);
  protected readonly latestRelease = signal<ChangelogRelease | null>(null);

  async ngOnInit(): Promise<void> {
    this.changelogError.set(null);
    this.isChangelogLoading.set(true);
    try {
      const response = await fetch('/CHANGELOG.md');
      if (!response.ok) {
        throw new Error(`Could not load the changelog (HTTP ${response.status}).`);
      }

      const release = parseLatestChangelogRelease(await response.text());
      if (!release) {
        throw new Error('No released changelog entries were found.');
      }

      this.latestRelease.set(release);
    } catch (error) {
      this.changelogError.set(
        error instanceof Error ? error.message : 'Unable to load the changelog.',
      );
    } finally {
      this.isChangelogLoading.set(false);
    }
  }

  protected navigateToFullChangelog() {
    window.open('/CHANGELOG.md');
  }

  closeWhatsNew(): void {
    this.isWhatsNewOpen.set(false);
  }
}
