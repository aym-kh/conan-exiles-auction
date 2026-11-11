import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Login } from './components/login/login';
import { SupabaseService } from './services/supabase';

@Component({
  imports: [
    CommonModule,
    RouterOutlet,
    Login,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly supabaseService = inject(SupabaseService);
  protected readonly user$ = this.supabaseService.user$;
}
