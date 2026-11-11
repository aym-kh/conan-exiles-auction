import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  imports: [
    CommonModule,
  ],
  selector: 'app-auction-plate',
  styleUrl: './auction-plate.css',
  templateUrl: './auction-plate.html',
})
export class AuctionPlate {
  @Input() auction: any;
}
