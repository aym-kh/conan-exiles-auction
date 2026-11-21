import { AUCTION_CURRENCIES } from "./const";

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

export type AuctionCurrencySymbol = (typeof AUCTION_CURRENCIES)[number]['symbol'];

export interface IAuctionCurrency {
    symbol: string;
    weight: number;
}

export interface IAuctionItem {
    id: string;
    auction_id: string;
    title: string;
    description: string | null;
    sort_order: number;
    created_at: string;
}

export interface IAuctionItemInput {
    id?: string;
    title: string;
    description: string | null;
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
    items?: IAuctionItem[];
}

export interface ICreateAuctionPayload {
    guild_id: string | null;
    title: string;
    description: string | null;
    is_blind: boolean;
    currencies: IAuctionCurrency[];
    end_time: string;
    items?: IAuctionItemInput[];
}

export type IUpdateAuctionPayload = Pick<
    ICreateAuctionPayload,
    'title' | 'description' | 'is_blind' | 'currencies' | 'end_time'
> & Pick<ICreateAuctionPayload, 'items'>;

export interface IAuctionBid {
    id: string;
    item_id: string | null;
    bidder_discord_id: string | null;
    bidder_name: string | null;
    bidder_avatar: string | null;
    currency_symbol: string;
    amount: number;
    calculated_weight: number;
    created_at: string;
}

export interface ChangelogSection {
    title: string;
    items: string[];
}

export interface ChangelogRelease {
    version: string;
    date: string;
    sections: ChangelogSection[];
}
