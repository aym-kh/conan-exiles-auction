import { CommonModule } from '@angular/common';
import { Component, computed, inject, Input, OnDestroy, OnInit, signal } from '@angular/core';
import { Auction } from '../../services/auction';
import { DiscordNotifications } from '../../services/discord-notifications';
import { LoadingService } from '../../services/loading';
import { IAuction } from '../../types';
import { formatCountdown } from '../../utils/countdown';
import { AuctionForm } from '../auction-form/auction-form';
import { RouterLink } from '@angular/router';
import { Button } from '../ui/button/button';
import { Title } from '../ui/title/title';
import { AUCTION_CURRENCIES, SCREEN_TITLES } from '../../const';

@Component({
  imports: [
    CommonModule,
    AuctionForm,
    RouterLink,
    Button,
    Title,
  ],
  selector: 'app-guild-dashboard',
  styleUrl: './guild-dashboard.css',
  templateUrl: './guild-dashboard.html',
})
export class GuildDashboard implements OnInit, OnDestroy {

  private readonly completedAuctionsPageSize = 10;
  private readonly auctionService = inject(Auction);
  private readonly discordNotifications = inject(DiscordNotifications);
  protected readonly loadingService = inject(LoadingService);
  @Input() guildId!: string;

  protected readonly auctions = signal<IAuction[]>([]);
  protected readonly completedSealedAuctions = signal<IAuction[]>([]);
  protected readonly completedSealedAuctionsTotal = signal(0);
  protected readonly completedSealedAuctionsPage = signal(1);
  protected readonly isCompletedAuctionsLoading = signal(false);
  protected readonly completedAuctionsError = signal<string | null>(null);
  protected readonly selectedAuctionId = signal<string | null>(null);
  protected readonly selectedAuction = signal<IAuction | null>(null);
  protected readonly isDetailsLoading = signal(false);
  protected readonly listError = signal<string | null>(null);
  protected readonly detailsError = signal<string | null>(null);
  protected readonly notificationMessage = signal<string | null>(null);
  protected readonly showCreateModal = signal(false);
  protected readonly completedAuctionsPageCount = computed(() =>
    Math.max(1, Math.ceil(this.completedSealedAuctionsTotal() / this.completedAuctionsPageSize)),
  );
  protected readonly auctionCurrencies = AUCTION_CURRENCIES;
  private readonly now = signal(Date.now());
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  protected titleContent = SCREEN_TITLES.guild_details_screen;

  async ngOnInit() {
    this.countdownInterval = setInterval(() => this.now.set(Date.now()), 1000);
    if (this.guildId) await this.loadAuctions();
  }

  ngOnDestroy() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  protected async loadAuctions() {
    await this.loadingService.track(async () => {
      this.listError.set(null);
      try {
        const data = await this.auctionService.getGuildAuctions(this.guildId);
        this.auctions.set(data);
        await this.loadCompletedSealedAuctions(1);

        const selected = data.find((auction) => auction.id === this.selectedAuctionId()) ?? data[0];
        if (!selected) {
          this.selectedAuctionId.set(null);
          this.selectedAuction.set(null);
          this.isDetailsLoading.set(false);
          return;
        }

        await this.fetchAuctionDetails(selected.id);
      } catch (error) {
        console.error(`Failed to load auctions for guild ${this.guildId}:`, error);
        this.listError.set('Could not load auctions for this server. Please try again.');
      }
    });
    await this.retryPendingNotifications();
  }

  private async retryPendingNotifications() {
    this.notificationMessage.set(null);
    try {
      const result = await this.discordNotifications.dispatchPendingNotifications();
      if (result.failed > 0) {
        this.notificationMessage.set(
          'Some Discord notifications could not be delivered. Check the server webhook settings.',
        );
      } else if (result.retrying > 0) {
        this.notificationMessage.set(
          'Some Discord notifications are temporarily delayed. Refresh the server page to retry later.',
        );
      } else if (result.pending > 0) {
        this.notificationMessage.set(
          'Some Discord notifications are waiting to be retried. Refresh the server page later to check again.',
        );
      } else if (result.sent > 0) {
        this.notificationMessage.set(
          `Sent ${result.sent} pending Discord notification${result.sent === 1 ? '' : 's'}.`,
        );
      }
    } catch (error) {
      console.error(`Failed to retry Discord notifications for guild ${this.guildId}:`, error);
      this.notificationMessage.set('Could not check pending Discord notifications. Refresh to try again.');
    }
  }

  protected selectAuction(auctionId: string) {
    if (this.selectedAuctionId() === auctionId && this.selectedAuction()) {
      return;
    }

    void this.fetchAuctionDetails(auctionId);
  }

  protected currencyLabel(symbol: string): string {
    return this.auctionCurrencies.find((currency) => currency.symbol === symbol)?.label ?? symbol;
  }

  protected remainingTime(endTime: string): string {
    return formatCountdown(endTime, this.now());
  }

  protected async loadCompletedSealedAuctions(page: number) {
    this.isCompletedAuctionsLoading.set(true);
    this.completedAuctionsError.set(null);

    try {
      const result = await this.auctionService.getGuildCompletedSealedAuctions(
        this.guildId,
        page,
        this.completedAuctionsPageSize,
      );
      this.completedSealedAuctions.set(result.auctions);
      this.completedSealedAuctionsTotal.set(result.total);
      this.completedSealedAuctionsPage.set(page);
    } catch (error) {
      console.error(`Failed to load completed sealed auctions for guild ${this.guildId}:`, error);
      this.completedAuctionsError.set('Could not load completed sealed auctions. Please try again.');
    } finally {
      this.isCompletedAuctionsLoading.set(false);
    }
  }

  protected async onAuctionCreated() {
    this.showCreateModal.set(false);
    this.selectedAuctionId.set(null);
    await this.loadAuctions();
  }

  private async fetchAuctionDetails(auctionId: string) {
    this.selectedAuctionId.set(auctionId);
    this.selectedAuction.set(null);
    this.detailsError.set(null);
    this.isDetailsLoading.set(true);

    try {
      const auction = await this.auctionService.getAuctionById(auctionId);
      if (this.selectedAuctionId() !== auctionId) {
        return;
      }
      if (!auction) {
        this.detailsError.set('This auction is no longer available.');
        return;
      }
      this.selectedAuction.set(auction);
    } catch (error) {
      console.error(`Failed to load auction ${auctionId}:`, error);
      if (this.selectedAuctionId() === auctionId) {
        this.detailsError.set('Could not load this auction. Please try again.');
      }
    } finally {
      if (this.selectedAuctionId() === auctionId) {
        this.isDetailsLoading.set(false);
      }
    }
  }
}
