import { AfterViewInit, Component, DestroyRef, ElementRef, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('bgVideo') videoRef!: ElementRef<HTMLVideoElement>;

  constructor() {
    this.user$.pipe(
      filter((user) => user === null),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      if (this.router.url !== '/') {
        void this.router.navigateByUrl('/');
      }
    });
  }

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
