import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, signal, SimpleChanges } from '@angular/core';
import { IAuction } from '../../../types';
import { formatCountdown } from '../../../utils/countdown';

@Component({
  imports: [
    CommonModule,
  ],
  selector: 'app-auction-plate',
  styleUrl: './auction-plate.css',
  templateUrl: './auction-plate.html',
})
export class AuctionPlate implements OnChanges, OnInit, OnDestroy {
  @Input({ required: true }) auction!: Pick<IAuction, 'title' | 'description' | 'end_time'>;

  private readonly now = signal(Date.now());
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  protected readonly remainingTime = () => {
    return formatCountdown(this.auction.end_time, this.now());
  };

  ngOnChanges(_changes: SimpleChanges) {
    this.now.set(Date.now());
  }

  ngOnInit() {
    this.countdownInterval = setInterval(() => this.now.set(Date.now()), 1000);
  }

  ngOnDestroy() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }
}
