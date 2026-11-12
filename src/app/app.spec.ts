import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { User } from '@supabase/supabase-js';
import { afterEach, vi } from 'vitest';
import { App } from './app';
import { SupabaseService } from './services/supabase';

describe('App', () => {
  const user$ = new BehaviorSubject<User | null | undefined>(null);

  beforeEach(async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    user$.next(null);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: SupabaseService, useValue: { user$: user$.asObservable() } },
      ],
    })
      .compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should not render the navbar login when signed out', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-login')).toBeNull();
  });
});
