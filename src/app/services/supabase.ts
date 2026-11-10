import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class SupabaseService {
    private supabase: SupabaseClient;
    private currentUser$ = new BehaviorSubject<User | null | undefined>(undefined);
    public readonly user$: Observable<User | null | undefined> = this.currentUser$.asObservable();

    constructor() {
        this.supabase = createClient(
            environment.supabaseUrl,
            environment.supabaseAnonKey,
        );

        this.supabase.auth.onAuthStateChange((_event, session) => {
            this.currentUser$.next(session?.user ?? null);
        });
    }

    // Trigger Discord OAuth login with scopes for server listing and identity
    async signInWithDiscord() {
        await this.supabase.auth.signInWithOAuth({
            provider: 'discord',
            options: {
                scopes: 'identify guilds',
                redirectTo: window.location.origin
            }
        });
    }

    async signOut() {
        await this.supabase.auth.signOut();
    }

    async getCurrentUser(): Promise<User | null> {
        const { data: { user } } = await this.supabase.auth.getUser();
        return user;
    }

    getClient(): SupabaseClient {
        return this.supabase;
    }
}