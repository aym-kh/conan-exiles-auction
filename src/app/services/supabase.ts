import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';
import { DiscordGuild } from '../types';

@Injectable({
    providedIn: 'root',
})
export class SupabaseService {
    private supabase: SupabaseClient;
    private currentUser$ = new BehaviorSubject<User | null | undefined>(undefined);
    public readonly user$: Observable<User | null | undefined> = this.currentUser$.asObservable();

    get client(): SupabaseClient {
        return this.supabase;
    }

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
                redirectTo: `${window.location.origin}/guilds`
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

    async getUserGuilds(): Promise<DiscordGuild[]> {
        const { data: { session }, error } = await this.supabase.auth.getSession();

        if (error || !session?.provider_token) {
            console.error('No provider token found in current session.', error);
            return [];
        }

        try {
            const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
                headers: {
                    Authorization: `Bearer ${session.provider_token}`
                }
            });

            if (!response.ok) {
                throw new Error(`Discord API error: ${response.statusText}`);
            }

            const guilds: DiscordGuild[] = await response.json();
            return guilds;
        } catch (err) {
            console.error('Failed to fetch Discord guilds:', err);
            return [];
        }
    }
}