import { Component, OnInit, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase';
import { LoadingService } from '../../services/loading';
import { Auction } from '../../services/auction';
import { DiscordGuild } from '../../types';
import { Router } from '@angular/router';
import { Title } from '../ui/title/title';
import { SCREEN_TITLES, SERVER_FEATURE_LABELS } from '../../const';

@Component({
  selector: 'app-guild-selector',
  standalone: true,
  imports: [
    CommonModule,
    Title,
  ],
  templateUrl: './guild-selector.html',
  styleUrl: './guild-selector.css'
})
export class GuildSelector implements OnInit {

  private readonly supabaseService = inject(SupabaseService);
  private readonly auctionService = inject(Auction);
  private readonly router = inject(Router);
  protected readonly loadingService = inject(LoadingService);

  protected guilds = signal<DiscordGuild[]>([]);
  protected selectedGuild = signal<DiscordGuild | null>(null);
  protected errorMessage = signal<string | null>(null);

  protected titleContent = SCREEN_TITLES.guilds_screen;

  @Output() guildSelected = new EventEmitter<DiscordGuild>();

  async ngOnInit() {
    await this.loadingService.track(async () => {
      const userGuilds = await this.supabaseService.getUserGuilds();
      this.guilds.set(userGuilds);
      this.selectedGuild.set(userGuilds[0] ?? null);
    });
  }

  protected selectGuild(guild: DiscordGuild) {
    this.errorMessage.set(null);
    this.selectedGuild.set(guild);
  }

  protected async joinSelectedGuild() {
    const guild = this.selectedGuild();
    if (!guild) {
      return;
    }

    this.errorMessage.set(null);
    try {
      await this.loadingService.track(async () => {
        await this.auctionService.ensureGuild(guild);
        await this.router.navigate(['/guilds', guild.id]);
      });
    } catch (error) {
      console.error('Failed to save selected Discord server:', error);
      this.errorMessage.set('Could not save this server. Please try again.');
    }
  }

  protected getGuildIcon(guild: DiscordGuild): string {
    if (!guild.icon) {
      return 'https://cdn.discordapp.com/embed/avatars/0.png'; // default fallback icon
    }
    return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
  }

  protected formatApproximateCount(count: number | undefined): string {
    return count === undefined ? 'Unavailable' : count.toLocaleString();
  }

  protected getFeatureLabels(guild: DiscordGuild): string[] {
    return guild.features.flatMap((feature) => {
      const label = SERVER_FEATURE_LABELS.get(feature);
      return label ? [label] : [];
    });
  }
}