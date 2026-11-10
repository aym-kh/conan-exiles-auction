import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class SupabaseService {
    private supabase: SupabaseClient;

    constructor() {
        this.supabase = createClient(
            environment.supabaseUrl,
            environment.supabaseAnonKey,
        );
    }

    // Trigger Discord OAuth login with scopes for server listing and identity
    async signInWithDiscord() {
        await this.supabase.auth.signInWithOAuth({
            provider: 'discord',
            options: {
                scopes: 'identify guilds',
                redirectTo: `${window.location.origin}/dashboard`
            }
        });
    }

    // Sign out method
    async signOut() {
        await this.supabase.auth.signOut();
    }

    // Get current active session user
    async getCurrentUser(): Promise<User | null> {
        const { data: { user } } = await this.supabase.auth.getUser();
        return user;
    }

    // Expose base client for real-time bid subscriptions and custom queries
    getClient(): SupabaseClient {
        return this.supabase;
    }
}