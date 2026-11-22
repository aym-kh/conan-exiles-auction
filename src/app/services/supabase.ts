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

        void this.initializeSession();
    }

    private async initializeSession(): Promise<void> {
        const { data, error } = await this.supabase.auth.getSession();
        const session = data.session;

        if (error) {
            console.error('Failed to initialize the authentication session:', error);
            await this.signOut();
            return;
        }

        if (!session) {
            this.currentUser$.next(null);
            return;
        }

        if (!session.provider_token) {
            console.warn('Discord provider token missing; signing out.');
            await this.signOut();
            return;
        }

        this.currentUser$.next(session.user);
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
        this.currentUser$.next(null);

        try {
            await this.supabase.auth.signOut({ scope: 'local' });
        } catch (error) {
            console.error('Failed to clear the Supabase session remotely:', error);
        }
    }

    async getCurrentUser(): Promise<User | null> {
        const { data, error } = await this.supabase.auth.getSession();
        if (error) {
            throw error;
        }
        return data.session?.user ?? null;
    }

    async hasValidDiscordSession(): Promise<boolean> {
        try {
            const { data, error } = await this.supabase.auth.getSession();
            const session = data.session;

            if (error || !session?.user || !session.provider_token) {
                return false;
            }

            if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
                return false;
            }

            const response = await fetch('https://discord.com/api/v10/users/@me', {
                headers: {
                    Authorization: `Bearer ${session.provider_token}`
                }
            });

            return response.ok;
        } catch {
            return false;
        }
    }

    getClient(): SupabaseClient {
        return this.supabase;
    }

    async getUserGuilds(): Promise<DiscordGuild[]> {
        const { data: { session }, error } = await this.supabase.auth.getSession();

        if (error || !session?.provider_token) {
            console.error('No provider token found in current session.', error);
            await this.signOut();
            return [];
        }

        try {
            const response = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
                headers: {
                    Authorization: `Bearer ${session.provider_token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    await this.signOut();
                }
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