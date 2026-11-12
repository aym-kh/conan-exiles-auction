import { CommonModule } from '@angular/common';
import { Component, inject, Input, signal } from '@angular/core';
import { Auction } from '../../services/auction';
import { LoadingService } from '../../services/loading';
import { IAuction } from '../../types';
import { AuctionForm } from '../auction-form/auction-form';
import { RouterLink } from '@angular/router';
import { Button } from '../ui/button/button';
import { AuctionPlate } from '../ui/auction-plate/auction-plate';

@Component({
  imports: [
    CommonModule,
    AuctionForm,
    RouterLink,
    Button,
    AuctionPlate,
  ],
  selector: 'app-guild-dashboard',
  styleUrl: './guild-dashboard.css',
  templateUrl: './guild-dashboard.html',
})
export class GuildDashboard {

  private readonly auctionService = inject(Auction);
  protected readonly loadingService = inject(LoadingService);
  @Input() guildId!: string;

  auctions = signal<IAuction[]>([]);
  showCreateModal = signal<boolean>(false);

  async ngOnInit() {
    if (this.guildId) await this.loadAuctions();
  }

  private async loadAuctions() {
    await this.loadingService.track(async () => {
      const data = await this.auctionService.getGuildAuctions(this.guildId);
      this.auctions.set(data);
    });
  }

  onAuctionCreated() {
    this.showCreateModal.set(false);
    this.loadAuctions();
  }
}
