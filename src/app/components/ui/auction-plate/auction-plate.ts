import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, signal, SimpleChanges } from '@angular/core';
import { IAuction } from '../../../types';

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
    const endTime = Date.parse(this.auction.end_time);
    const remainingSeconds = Number.isFinite(endTime)
      ? Math.max(0, Math.floor((endTime - this.now()) / 1000))
      : 0;
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
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
