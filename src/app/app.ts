import { Component, inject } from '@angular/core';
import { SupabaseService } from './services/supabase';
import { RouterOutlet } from '@angular/router';
import { Button } from './components/ui/button/button';
import { Login } from './components/login/login';

@Component({
  imports: [
    RouterOutlet,
    Login,
    Button,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly supabaseService = inject(SupabaseService);

}
