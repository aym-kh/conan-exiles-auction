import { Component, OnInit, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase';
import { DiscordGuild } from '../../types';

@Component({
  selector: 'app-guild-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './guild-selector.html'
})
export class GuildSelector implements OnInit {

  private readonly supabaseService = inject(SupabaseService);

  private guilds = signal<DiscordGuild[]>([]);
  private selectedGuild = signal<DiscordGuild | null>(null);
  private isLoading = signal<boolean>(true);

  @Output() guildSelected = new EventEmitter<DiscordGuild>();

  async ngOnInit() {
    try {
      const userGuilds = await this.supabaseService.getUserGuilds();
      this.guilds.set(userGuilds);
    } finally {
      this.isLoading.set(false);
    }
  }

  protected selectGuild(guild: DiscordGuild) {
    this.selectedGuild.set(guild);
    this.guildSelected.emit(guild);
  }

  protected getGuildIcon(guild: DiscordGuild): string {
    if (!guild.icon) {
      return 'https://cdn.discordapp.com/embed/avatars/0.png'; // default fallback icon
    }
    return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
  }
}