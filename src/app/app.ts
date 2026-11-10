import { Component, inject } from '@angular/core';
import { Login } from './components/login/login';
import { SupabaseService } from './services/supabase';
import { GuildSelector } from './components/guild-selector/guild-selector';
import { CommonModule } from '@angular/common';

@Component({
  imports: [
    CommonModule,
    Login,
    GuildSelector,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly supabaseService = inject(SupabaseService);

  protected onGuildSelected($event: any) {
    console.log($event);

  }
}
