import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Login } from './components/login/login';
import { LoadingService } from './services/loading';
import { SupabaseService } from './services/supabase';
import { Changeslog } from './components/ui/changeslog/changeslog';

@Component({
  imports: [
    CommonModule,
    RouterOutlet,
    Login,
    Changeslog,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements AfterViewInit {

  protected readonly supabaseService = inject(SupabaseService);
  protected readonly loadingService = inject(LoadingService);
  protected readonly user$ = this.supabaseService.user$;
  @ViewChild('bgVideo') videoRef!: ElementRef<HTMLVideoElement>;

  ngAfterViewInit(): void {
    this.ensurePlayback();
  }

  onCanPlay(): void {
    this.ensurePlayback();
  }

  private ensurePlayback(): void {
    const video = this.videoRef?.nativeElement;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;

    if (video.paused) {
      video.play().catch(() => { });
    }
  }
}
