import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Auction } from '../../services/auction';
import { SupabaseService } from '../../services/supabase';
import { IAuction } from '../../types';
import { AuctionForm } from '../auction-form/auction-form';

@Component({
  imports: [CommonModule, AuctionForm],
  selector: 'app-auction-detail',
  styleUrl: './auction-detail.css',
  templateUrl: './auction-detail.html',
})
export class AuctionDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auctionService = inject(Auction);
  private readonly supabaseService = inject(SupabaseService);

  protected readonly auction = signal<IAuction | null>(null);
  protected readonly isOwner = signal(false);
  protected readonly isLoading = signal(true);
  protected readonly isDeleting = signal(false);
  protected readonly showEditModal = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit() {
    await this.loadAuction();
  }

  private async loadAuction() {
    const auctionId = this.route.snapshot.paramMap.get('auctionId');
    if (!auctionId) {
      this.errorMessage.set('Auction not found.');
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const auction = await this.auctionService.getAuctionById(auctionId);
      this.auction.set(auction);
      if (!auction) {
        this.errorMessage.set('Auction not found.');
        return;
      }

      const user = await this.supabaseService.getCurrentUser();
      this.isOwner.set(user?.id === auction.seller_discord_id);
    } catch (error) {
      console.error(`Failed to load auction ${auctionId}:`, error);
      this.errorMessage.set('Could not load this auction. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async deleteAuction() {
    const auction = this.auction();
    if (!auction || !this.isOwner() || this.isDeleting()) {
      return;
    }

    if (!window.confirm(`Delete "${auction.title}"? This cannot be undone.`)) {
      return;
    }

    this.isDeleting.set(true);
    this.errorMessage.set(null);
    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user || user.id !== auction.seller_discord_id) {
        this.isOwner.set(false);
        throw new Error('Only the auction owner can delete this auction.');
      }

      await this.auctionService.deleteAuction(auction.id, user.id);
      await this.router.navigate(['/guilds', auction.guild_id]);
    } catch (error) {
      console.error(`Failed to delete auction ${auction.id}:`, error);
      this.errorMessage.set(error instanceof Error ? error.message : 'Could not delete this auction.');
    } finally {
      this.isDeleting.set(false);
    }
  }

  protected async onAuctionUpdated() {
    this.showEditModal.set(false);
    await this.loadAuction();
  }

  protected backToGuild() {
    const guildId = this.auction()?.guild_id;
    if (guildId) {
      void this.router.navigate(['/guilds', guildId]);
    } else {
      void this.router.navigate(['/guilds']);
    }
  }
}
