export interface DiscordGuild {
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    permissions: string;
    features: string[];
}

export type TAuctionStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED';

export interface IAuctionCurrency {
    symbol: string;
    weight: number;
}

export interface IAuction {
    id: string;
    guild_id: string | null;
    seller_discord_id: string;
    title: string;
    description: string | null;
    is_blind: boolean | null;
    currencies: IAuctionCurrency[];
    status: TAuctionStatus | null;
    end_time: string;
    created_at: string | null;
}

export interface ICreateAuctionPayload {
    guild_id: string | null;
    title: string;
    description: string | null;
    is_blind: boolean;
    currencies: IAuctionCurrency[];
    end_time: string;
}

export type IUpdateAuctionPayload = Pick<
    ICreateAuctionPayload,
    'title' | 'description' | 'is_blind' | 'currencies' | 'end_time'
>;