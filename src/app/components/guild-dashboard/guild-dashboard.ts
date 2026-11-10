import { CommonModule } from '@angular/common';
import { Component, inject, Input, signal } from '@angular/core';
import { Auction } from '../../services/auction';
import { IAuction } from '../../types';

@Component({
  imports: [CommonModule],
  selector: 'app-guild-dashboard',
  styleUrl: './guild-dashboard.css',
  templateUrl: './guild-dashboard.html',
})
export class GuildDashboard {

  private readonly auctionService = inject(Auction);
  @Input() guildId!: string;

  auctions = signal<IAuction[]>([]);
  isLoading = signal<boolean>(true);

  async ngOnInit() {
    if (this.guildId) await this.loadAuctions();
  }

  private async loadAuctions() {
    this.isLoading.set(true);
    try {
      const data = await this.auctionService.getGuildAuctions(this.guildId);
      this.auctions.set(data);
    } finally {
      this.isLoading.set(false);
    }
  }
}
