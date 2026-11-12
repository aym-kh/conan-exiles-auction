export interface DiscordGuild {
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    permissions: string;
    features: string[];
    approximate_member_count?: number;
    approximate_presence_count?: number;
}

export type TAuctionStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED';

export const AUCTION_CURRENCIES = [
    { symbol: 'blood_crystal', label: 'Blood Crystals' },
    { symbol: 'fragment_of_power', label: 'Fragment of Power' },
    { symbol: 'gold_coin', label: 'Gold Coin' },
    { symbol: 'gold_bar', label: 'Gold Bar' },
] as const;

export type AuctionCurrencySymbol = (typeof AUCTION_CURRENCIES)[number]['symbol'];

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

export interface IAuctionBid {
    id: string;
    bidder_discord_id: string | null;
    bidder_name: string | null;
    bidder_avatar: string | null;
    currency_symbol: string;
    amount: number;
    calculated_weight: number;
    created_at: string;
}