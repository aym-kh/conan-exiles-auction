import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  imports: [CommonModule],
  selector: 'app-guild-dashboard',
  styleUrl: './guild-dashboard.css',
  templateUrl: './guild-dashboard.html',
})
export class GuildDashboard {
  @Input() guildId!: string;
}
