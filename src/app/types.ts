export interface DiscordGuild {
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    permissions: string;
    features: string[];
}

export type TAuctionStatus = 'ACTIVE' | 'ENDED' | 'CANCELLED';

export interface IAuction {
    id: string;
    guild_id: string;
    created_by_discord_id: string;
    item_name: string;
    item_description?: string;
    item_image_url?: string;
    starting_bid: number;
    min_increment: number;
    currency_symbol: string; // e.g., 'Blood Crystals', 'Gold Bars'
    status: TAuctionStatus;
    ends_at: string;
    created_at: string;
    updated_at?: string;
}

export interface ICreateAuctionPayload {
    guild_id: string;
    item_name: string;
    item_description?: string;
    item_image_url?: string;
    starting_bid: number;
    min_increment?: number;
    currency_symbol: string;
    ends_at: string;
}