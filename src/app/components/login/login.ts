import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase';
import { Button } from '../ui/button/button';
import packageJson from '../../../../package.json';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    Button,
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login {
  protected readonly supabaseService = inject(SupabaseService);
  protected readonly user$ = this.supabaseService.user$;
  protected readonly version = packageJson.version;

  async loginWithDiscord() {
    try {
      await this.supabaseService.signInWithDiscord();
    } catch (error) {
      console.error('Error logging in with Discord:', error);
    }
  }

  async logout() {
    await this.supabaseService.signOut();
  }
}