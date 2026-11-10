import { Component, OnInit, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase';
import { Auction } from '../../services/auction';
import { DiscordGuild } from '../../types';
import { Router } from '@angular/router';
import { ServerPlate } from '../ui/server-plate/server-plate';

@Component({
  selector: 'app-guild-selector',
  standalone: true,
  imports: [
    CommonModule,
    ServerPlate,
  ],
  templateUrl: './guild-selector.html',
  styleUrl: './guild-selector.css'
})
export class GuildSelector implements OnInit {

  private readonly supabaseService = inject(SupabaseService);
  private readonly auctionService = inject(Auction);
  private readonly router = inject(Router);

  private guilds = signal<DiscordGuild[]>([]);
  private selectedGuild = signal<DiscordGuild | null>(null);
  private isLoading = signal<boolean>(true);
  protected errorMessage = signal<string | null>(null);

  @Output() guildSelected = new EventEmitter<DiscordGuild>();

  async ngOnInit() {
    try {
      const userGuilds = await this.supabaseService.getUserGuilds();
      this.guilds.set(userGuilds);
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async selectGuild(guild: DiscordGuild) {
    this.errorMessage.set(null);
    this.selectedGuild.set(guild);

    try {
      await this.auctionService.ensureGuild(guild);
      await this.router.navigate(['/guilds', guild.id]);
    } catch (error) {
      console.error('Failed to save selected Discord server:', error);
      this.errorMessage.set('Could not save this server. Please try again.');
      this.selectedGuild.set(null);
    }
  }

  protected getGuildIcon(guild: DiscordGuild): string {
    if (!guild.icon) {
      return 'https://cdn.discordapp.com/embed/avatars/0.png'; // default fallback icon
    }
    return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
  }
}