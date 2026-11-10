import { inject, Service } from '@angular/core';
import { SupabaseService } from './supabase';
import { IAuction, ICreateAuctionPayload } from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';

@Service()
export class Auction {

    private readonly supabaseService = inject(SupabaseService);

    private get client() {
        return this.supabaseService.client;
    }

    async getGuildAuctions(guildId: string): Promise<IAuction[]> {
        const { data, error } = await this.client
            .from('auctions')
            .select('*')
            .eq('guild_id', guildId)
            .eq('status', 'ACTIVE')
            .order('created_at', { ascending: false });

        if (error) {
            console.error(`Error fetching auctions for guild ${guildId}:`, error);
            throw error;
        }

        return data || [];
    }

    async getAuctionById(auctionId: string): Promise<IAuction | null> {
        const { data, error } = await this.client
            .from('auctions')
            .select('*')
            .eq('id', auctionId)
            .single();

        if (error) {
            console.error(`Error fetching auction ${auctionId}:`, error);
            return null;
        }

        return data;
    }

    async createAuction(payload: ICreateAuctionPayload, userDiscordId: string): Promise<IAuction> {
        const { data, error } = await this.client
            .from('auctions')
            .insert([
                {
                    ...payload,
                    created_by_discord_id: userDiscordId,
                    status: 'ACTIVE'
                }
            ])
            .select()
            .single();

        if (error) {
            console.error('Error creating auction:', error);
            throw error;
        }

        return data;
    }

    async endAuction(auctionId: string): Promise<void> {
        const { error } = await this.client
            .from('auctions')
            .update({ status: 'ENDED', updated_at: new Date().toISOString() })
            .eq('id', auctionId);

        if (error) {
            console.error(`Error ending auction ${auctionId}:`, error);
            throw error;
        }
    }

    subscribeToGuildAuctions(guildId: string, onChange: () => void): RealtimeChannel {
        return this.client
            .channel(`guild-auctions-${guildId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'auctions',
                    filter: `guild_id=eq.${guildId}`
                },
                () => onChange()
            )
            .subscribe();
    }

}
