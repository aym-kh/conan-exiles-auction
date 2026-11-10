import { inject, Service } from '@angular/core';
import { SupabaseService } from './supabase';
import {
    DiscordGuild,
    IAuction,
    IAuctionBid,
    ICreateAuctionPayload,
    IUpdateAuctionPayload,
} from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';

@Service()
export class Auction {

    private readonly supabaseService = inject(SupabaseService);

    private get client() {
        return this.supabaseService.client;
    }

    async ensureGuild(guild: Pick<DiscordGuild, 'id' | 'name'>): Promise<void> {
        const { error } = await this.client
            .from('guilds')
            .upsert(
                {
                    discord_guild_id: guild.id,
                    guild_name: guild.name,
                },
                { onConflict: 'discord_guild_id' },
            );

        if (error) {
            console.error(`Error saving Discord guild ${guild.id}:`, error);
            throw error;
        }
    }

    async getGuildAuctions(guildId: string): Promise<IAuction[]> {
        const { data, error } = await this.client
            .from('auctions')
            .select('*')
            .eq('guild_id', guildId)
            .eq('status', 'ACTIVE')
            .gt('end_time', new Date().toISOString())
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
            if (error.code === 'PGRST116') {
                return null;
            }
            console.error(`Error fetching auction ${auctionId}:`, error);
            throw error;
        }

        return data;
    }

    async getAuctionBids(auctionId: string): Promise<IAuctionBid[]> {
        const { data, error } = await this.client.rpc('get_auction_bids', {
            p_auction_id: auctionId,
        });

        if (error) {
            console.error(`Error fetching bids for auction ${auctionId}:`, error);
            throw error;
        }

        return data ?? [];
    }

    async placeBid(auctionId: string, currencySymbol: string, amount: number): Promise<void> {
        const { data: { session }, error: sessionError } = await this.client.auth.getSession();
        if (sessionError) {
            throw sessionError;
        }
        if (!session?.provider_token) {
            throw new Error('Your Discord session has expired. Sign out and sign in again before bidding.');
        }

        const { error } = await this.client.functions.invoke('place-bid', {
            body: {
                auctionId,
                currencySymbol,
                amount,
                providerToken: session.provider_token,
            },
        });

        if (error) {
            console.error(`Error placing bid on auction ${auctionId}:`, error);
            if ('context' in error && error.context instanceof Response) {
                const body: unknown = await error.context.clone().json().catch(() => null);
                if (
                    typeof body === 'object'
                    && body !== null
                    && 'error' in body
                    && typeof body.error === 'string'
                ) {
                    throw new Error(body.error);
                }
            }
            throw error;
        }
    }

    subscribeToAuctionBids(auctionId: string, onChange: () => void): RealtimeChannel {
        return this.client
            .channel(`auction:${auctionId}`, { config: { private: true } })
            .on('broadcast', { event: 'bid_changed' }, onChange)
            .subscribe();
    }

    async updateAuction(
        auctionId: string,
        payload: IUpdateAuctionPayload,
        userId: string,
    ): Promise<IAuction> {
        const { data, error } = await this.client
            .from('auctions')
            .update(payload)
            .eq('id', auctionId)
            .eq('seller_discord_id', userId)
            .select()
            .single();

        if (error) {
            console.error(`Error updating auction ${auctionId}:`, error);
            throw error;
        }

        return data;
    }

    async deleteAuction(auctionId: string, userId: string): Promise<void> {
        const { data, error } = await this.client
            .from('auctions')
            .delete()
            .eq('id', auctionId)
            .eq('seller_discord_id', userId)
            .select('id')
            .single();

        if (error) {
            console.error(`Error deleting auction ${auctionId}:`, error);
            throw error;
        }

        if (!data) {
            throw new Error('Auction was not deleted. It may no longer exist or you may not own it.');
        }
    }

    async createAuction(payload: ICreateAuctionPayload, userDiscordId: string): Promise<IAuction> {
        const { data, error } = await this.client
            .from('auctions')
            .insert([
                {
                    ...payload,
                    seller_discord_id: userDiscordId,
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
            .update({ status: 'ENDED' })
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
