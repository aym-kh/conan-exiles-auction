import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { vi } from 'vitest';
import { requireValidDiscordSession } from './require-valid-discord-session.guard';
import { SupabaseService } from '../services/supabase';

describe('requireValidDiscordSession', () => {
  it('allows navigation when the Discord session is valid', async () => {
    const supabase = {
      hasValidDiscordSession: vi.fn().mockResolvedValue(true),
      signOut: vi.fn(),
    };
    const router = {
      createUrlTree: vi.fn().mockReturnValue({ root: true }),
    };

    await TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: supabase },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    const result = await TestBed.runInInjectionContext(() => requireValidDiscordSession({} as never, {} as never));

    expect(result).toBe(true);
    expect(supabase.signOut).not.toHaveBeenCalled();
  });

  it('logs out and redirects when the Discord session is expired', async () => {
    const root = {} as UrlTree;
    const supabase = {
      hasValidDiscordSession: vi.fn().mockResolvedValue(false),
      signOut: vi.fn().mockResolvedValue(undefined),
    };
    const router = {
      createUrlTree: vi.fn().mockReturnValue(root),
    };

    await TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: supabase },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    const result = await TestBed.runInInjectionContext(() => requireValidDiscordSession({} as never, {} as never));

    expect(supabase.signOut).toHaveBeenCalledOnce();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
    expect(result).toBe(root);
  });
});
