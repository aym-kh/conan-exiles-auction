export const AUCTION_CURRENCIES = [
    { symbol: 'blood_crystal', label: 'Blood Crystals' },
    { symbol: 'eldarium', label: 'Eldarium' },
    { symbol: 'fragment_of_power', label: 'Fragment of Power' },
    { symbol: 'gold_coin', label: 'Gold Coin' },
    { symbol: 'gold_bar', label: 'Gold Bar' },
] as const;

export const SERVER_FEATURE_LABELS = new Map([
    ['COMMUNITY', 'Community'],
    ['VERIFIED', 'Verified'],
    ['PARTNERED', 'Partnered'],
    ['DISCOVERABLE', 'Discoverable'],
]);

export const SCREEN_TITLES = {
    guilds_screen: {
        title: "Server browser",
        subtitle: "Note: choose a server you own in order to be able to create auctions",
    },
    guild_details_screen: {
        title: "Auction browser",
        subtitle: "Keep an eye on the timers to figure out which auctions are about to end",
    },
}