import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Auction } from '../../services/auction';
import { SupabaseService } from '../../services/supabase';
import { IAuction, IAuctionBid } from '../../types';
import { AuctionForm } from '../auction-form/auction-form';

@Component({
  imports: [CommonModule, ReactiveFormsModule, AuctionForm],
  selector: 'app-auction-detail',
  styleUrl: './auction-detail.css',
  templateUrl: './auction-detail.html',
})
export class AuctionDetail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auctionService = inject(Auction);
  private readonly supabaseService = inject(SupabaseService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private bidsChannel: RealtimeChannel | null = null;
  private readonly now = signal(Date.now());
  private expirationTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly auction = signal<IAuction | null>(null);
  protected readonly bids = signal<IAuctionBid[]>([]);
  protected readonly currentUserId = signal<string | null>(null);
  protected readonly isOwner = signal(false);
  protected readonly isLoading = signal(true);
  protected readonly isBidsLoading = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly isPlacingBid = signal(false);
  protected readonly showEditModal = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly bidError = signal<string | null>(null);
  protected readonly isAuctionExpired = computed(() => {
    const auction = this.auction();
    return !!auction && new Date(auction.end_time).getTime() <= this.now();
  });
  protected readonly bidForm = this.fb.group({
    currencySymbol: ['', Validators.required],
    amount: [1, [Validators.required, Validators.min(1), Validators.max(2147483647), Validators.pattern(/^\d+$/)]],
  });
  protected readonly currentHighestBid = computed(() =>
    this.bids().reduce<IAuctionBid | null>(
      (highest, bid) => !highest || bid.calculated_weight > highest.calculated_weight ? bid : highest,
      null,
    ),
  );
  protected readonly canBid = computed(() => {
    const auction = this.auction();
    const userId = this.currentUserId();
    return !!auction
      && !!userId
      && userId !== auction.seller_discord_id
      && auction.status === 'ACTIVE'
      && new Date(auction.end_time).getTime() > this.now();
  });

  async ngOnInit() {
    this.expirationTimer = setInterval(() => this.now.set(Date.now()), 1000);
    await this.loadAuction();
  }

  ngOnDestroy() {
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
    }
    if (this.bidsChannel) {
      void this.supabaseService.client.removeChannel(this.bidsChannel);
    }
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
      this.currentUserId.set(user?.id ?? null);
      this.isOwner.set(user?.id === auction.seller_discord_id);

      if (user && !this.bidsChannel) {
        this.bidsChannel = this.auctionService.subscribeToAuctionBids(
          auction.id,
          () => void this.loadBids(auction.id),
        );
      }
      await this.loadBids(auction.id);
    } catch (error) {
      console.error(`Failed to load auction ${auctionId}:`, error);
      this.errorMessage.set('Could not load this auction. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadBids(auctionId: string) {
    this.isBidsLoading.set(true);
    this.bidError.set(null);
    try {
      this.bids.set(await this.auctionService.getAuctionBids(auctionId));
    } catch (error) {
      console.error(`Failed to load bids for auction ${auctionId}:`, error);
      this.bidError.set('Could not load bid history.');
    } finally {
      this.isBidsLoading.set(false);
    }
  }

  protected async placeBid() {
    const auction = this.auction();
    const userId = this.currentUserId();
    if (!auction || !userId || !this.canBid() || this.bidForm.invalid || this.isPlacingBid()) {
      this.bidForm.markAllAsTouched();
      return;
    }

    const { currencySymbol, amount } = this.bidForm.getRawValue();
    this.isPlacingBid.set(true);
    this.bidError.set(null);
    try {
      await this.auctionService.placeBid(auction.id, currencySymbol, amount);
      await this.loadBids(auction.id);
    } catch (error) {
      console.error(`Failed to place bid on auction ${auction.id}:`, error);
      this.bidError.set(error instanceof Error ? error.message : 'Could not place your bid.');
    } finally {
      this.isPlacingBid.set(false);
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
