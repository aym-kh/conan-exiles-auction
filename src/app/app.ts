import { Component, inject } from '@angular/core';
import { SupabaseService } from './services/supabase';
import { RouterOutlet } from '@angular/router';
import packageJson from '../../package.json';

@Component({
  imports: [
    RouterOutlet,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly supabaseService = inject(SupabaseService);
  protected readonly version = packageJson.version;
}
