import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Auction } from '../../services/auction';
import { DiscordNotifications } from '../../services/discord-notifications';
import { SupabaseService } from '../../services/supabase';
import { LoadingService } from '../../services/loading';
import { IAuction, IAuctionBid, IAuctionImage } from '../../types';
import { formatCountdown } from '../../utils/countdown';
import { AuctionForm } from '../auction-form/auction-form';
import { AUCTION_CURRENCIES } from '../../const';
import { AuctionImageGallery } from '../auction-image-gallery/auction-image-gallery';

@Component({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AuctionForm,
    AuctionImageGallery,
  ],
  selector: 'app-auction-detail',
  styleUrl: './auction-detail.css',
  templateUrl: './auction-detail.html',
})
export class AuctionDetail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auctionService = inject(Auction);
  private readonly discordNotifications = inject(DiscordNotifications);
  private readonly supabaseService = inject(SupabaseService);
  protected readonly loadingService = inject(LoadingService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private bidsChannel: RealtimeChannel | null = null;
  private wasSealedBiddingActive = false;
  private readonly now = signal(Date.now());
  private expirationTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly auction = signal<IAuction | null>(null);
  protected readonly bids = signal<IAuctionBid[]>([]);
  protected readonly auctionImages = signal<IAuctionImage[]>([]);
  private readonly emptyAuctionImages: IAuctionImage[] = [];
  private readonly auctionImagesByItem = computed(() => {
    const groups = new Map<string, IAuctionImage[]>();
    for (const image of this.auctionImages()) {
      const key = image.item_id ?? 'auction';
      const group = groups.get(key);
      if (group) {
        group.push(image);
      } else {
        groups.set(key, [image]);
      }
    }
    return groups;
  });
  protected readonly sealedOfferCount = signal<number | null>(null);
  protected readonly selectedItemId = signal<string | null>(null);
  protected readonly currentUserId = signal<string | null>(null);
  protected readonly isOwner = signal(false);
  protected readonly isBidsLoading = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly isPlacingBid = signal(false);
  protected readonly showEditModal = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly bidError = signal<string | null>(null);
  protected readonly bidSubmissionMessage = signal<string | null>(null);
  protected readonly imageError = signal<string | null>(null);

  async ngOnInit() {
    this.expirationTimer = setInterval(() => {
      this.now.set(Date.now());
      const sealedBiddingIsActive = this.isSealedBiddingActive();
      if (this.wasSealedBiddingActive && !sealedBiddingIsActive) {
        const auction = this.auction();
        if (auction) {
          void this.loadBids(auction.id);
        }
      }
      this.wasSealedBiddingActive = sealedBiddingIsActive;
    }, 1000);
    await this.loadAuction();
  }

  protected currencyLabel(currencySymbol: string): string {
    return AUCTION_CURRENCIES.find((currency) => currency.symbol === currencySymbol)?.label ?? currencySymbol;
  }

  protected imagesForItem(itemId: string | null): IAuctionImage[] {
    return this.auctionImagesByItem().get(itemId ?? 'auction') ?? this.emptyAuctionImages;
  }

  protected currencyIconPath(currencySymbol: string): string {
    const normalizedSymbol = currencySymbol.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const currency = AUCTION_CURRENCIES.find((option) =>
      option.symbol === normalizedSymbol
      || option.label.toLowerCase().replace(/[\s-]+/g, '_') === normalizedSymbol,
    );
    return `/images/currency/${currency?.symbol ?? normalizedSymbol}.webp`;
  }

  protected remainingTime(endTime: string): string {
    return formatCountdown(endTime, this.now());
  }

  protected readonly isAuctionExpired = computed(() => {
    const auction = this.auction();
    return !!auction && new Date(auction.end_time).getTime() <= this.now();
  });

  protected readonly isSealedBiddingActive = computed(() => {
    const auction = this.auction();
    return !!auction
      && auction.bid_visibility === 'sealed'
      && auction.status === 'ACTIVE'
      && new Date(auction.end_time).getTime() > this.now();
  });

  protected readonly bidVisibilityDescription = computed(() => {
    switch (this.auction()?.bid_visibility) {
      case 'open':
        return 'Everyone can see bidder names and offer amounts while bidding is open.';
      case 'anonymous':
        return 'Offer amounts are visible while bidder names stay hidden.';
      case 'sealed':
        return 'Offers and bidder names stay hidden while active. Bidders can revise offers until bidding closes; final offers are then revealed without names.';
      default:
        return '';
    }
  });

  protected readonly sealedOfferCountMessage = computed(() => {
    const count = this.sealedOfferCount();
    const scope = this.auction()?.items?.length ? 'for this item' : 'for this auction';

    if (count === null) {
      return 'Offers are sealed until the auction ends.';
    }
    if (count === 0) {
      return `No sealed offers yet ${scope}.`;
    }

    return `${count} sealed ${count === 1 ? 'offer' : 'offers'} received ${scope}.`;
  });

  protected readonly bidForm = this.fb.group({
    currencySymbol: ['', Validators.required],
    amount: [1, [Validators.required, Validators.min(1), Validators.max(2147483647), Validators.pattern(/^\d+$/)]],
  });

  protected readonly currentHighestBid = computed(() =>
    this.selectedItemBids().reduce<IAuctionBid | null>(
      (highest, bid) => !highest || bid.calculated_weight > highest.calculated_weight ? bid : highest,
      null,
    ),
  );

  protected readonly selectedItemBids = computed(() => {
    const itemId = this.selectedItemId();
    return this.bids().filter((bid) => bid.item_id === itemId);
  });

  protected readonly selectedItemTitle = computed(() =>
    this.auction()?.items?.find((item) => item.id === this.selectedItemId())?.title ?? '',
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

  private async loadAuction() {
    const auctionId = this.route.snapshot.paramMap.get('auctionId');
    if (!auctionId) {
      this.errorMessage.set('Auction not found.');
      return;
    }

    this.errorMessage.set(null);
    await this.loadingService.track(async () => {
      try {
        const auction = await this.auctionService.getAuctionById(auctionId);
        this.auction.set(auction);
        if (!auction) {
          this.errorMessage.set('Auction not found.');
          return;
        }
        this.selectedItemId.set(auction.items?.[0]?.id ?? null);
        this.imageError.set(null);
        try {
          this.auctionImages.set(await this.auctionService.getAuctionImages(auction.id));
        } catch (error) {
          console.error(`Failed to load images for auction ${auction.id}:`, error);
          this.imageError.set('Could not load auction images.');
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
        this.wasSealedBiddingActive = this.isSealedBiddingActive();
        await this.loadBids(auction.id);
      } catch (error) {
        console.error(`Failed to load auction ${auctionId}:`, error);
        this.errorMessage.set('Could not load this auction. Please try again.');
      }
    });
  }

  private async loadBids(auctionId: string) {
    this.isBidsLoading.set(true);
    this.bidError.set(null);
    this.sealedOfferCount.set(null);
    try {
      this.bids.set(await this.auctionService.getAuctionBids(auctionId));
      if (this.isSealedBiddingActive()) {
        this.sealedOfferCount.set(
          await this.auctionService.getAuctionBidCount(auctionId, this.selectedItemId()),
        );
      }
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
    if (
      !auction
      || !userId
      || !this.canBid()
      || this.bidForm.invalid
      || this.isPlacingBid()
      || (auction.items?.length && !this.selectedItemId())
    ) {
      this.bidForm.markAllAsTouched();
      return;
    }

    const { currencySymbol, amount } = this.bidForm.getRawValue();
    this.isPlacingBid.set(true);
    this.bidError.set(null);
    this.bidSubmissionMessage.set(null);
    try {
      const bidId = await this.auctionService.placeBid(
        auction.id,
        currencySymbol,
        amount,
        this.selectedItemId(),
      );
      if (auction.bid_visibility === 'sealed') {
        this.bidSubmissionMessage.set('Your sealed offer has been recorded. You can revise it until bidding closes.');
      } else {
        try {
          const dispatch = await this.discordNotifications.dispatchPendingNotifications({
            auctionId: auction.id,
            eventType: 'bid_placed',
            bidId,
          });
          if (dispatch.retrying > 0 || dispatch.failed > 0 || dispatch.pending > 0) {
            this.bidSubmissionMessage.set(
              'Your bid was accepted, but its Discord notification is still pending.',
            );
          } else if (dispatch.sent > 0) {
            this.bidSubmissionMessage.set('Your bid was accepted and shared with the server.');
          } else {
            this.bidSubmissionMessage.set('Your bid was accepted.');
          }
        } catch (error) {
          console.error(`Bid ${bidId} was accepted, but Discord notification delivery failed:`, error);
          this.bidSubmissionMessage.set(
            'Your bid was accepted, but its Discord notification could not be confirmed.',
          );
        }
      }
      await this.loadBids(auction.id);
    } catch (error) {
      console.error(`Failed to place bid on auction ${auction.id}:`, error);
      this.bidError.set(error instanceof Error ? error.message : 'Could not place your bid.');
    } finally {
      this.isPlacingBid.set(false);
    }
  }

  protected selectItem(event: Event) {
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      this.selectedItemId.set(target.value || null);
      this.bidSubmissionMessage.set(null);
      if (this.isSealedBiddingActive()) {
        const auction = this.auction();
        if (auction) {
          void this.loadBids(auction.id);
        }
      }
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

  ngOnDestroy() {
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
    }
    if (this.bidsChannel) {
      void this.supabaseService.client.removeChannel(this.bidsChannel);
    }
  }
}
