import { CommonModule } from '@angular/common';
import { Component, inject, Input, signal } from '@angular/core';
import { Auction } from '../../services/auction';
import { IAuction } from '../../types';
import { AuctionForm } from '../auction-form/auction-form';
import { RouterLink } from '@angular/router';

@Component({
  imports: [
    CommonModule,
    AuctionForm,
    RouterLink,
  ],
  selector: 'app-guild-dashboard',
  styleUrl: './guild-dashboard.css',
  templateUrl: './guild-dashboard.html',
})
export class GuildDashboard {

  private readonly auctionService = inject(Auction);
  @Input() guildId!: string;

  auctions = signal<IAuction[]>([]);
  isLoading = signal<boolean>(true);
  showCreateModal = signal<boolean>(false);

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

  onAuctionCreated() {
    this.showCreateModal.set(false);
    this.loadAuctions();
  }
}
