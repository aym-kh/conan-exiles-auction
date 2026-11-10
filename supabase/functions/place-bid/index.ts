import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PlaceBidRequest {
  auctionId: string;
  currencySymbol: string;
  amount: number;
  providerToken: string;
}

interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

interface DiscordGuild {
  id: string;
}

const response = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const isPlaceBidRequest = (value: unknown): value is PlaceBidRequest => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const body = value as Record<string, unknown>;
  return typeof body.auctionId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.auctionId)
    && typeof body.currencySymbol === 'string'
    && !!body.currencySymbol.trim()
    && Number.isSafeInteger(body.amount)
    && typeof body.amount === 'number'
    && body.amount > 0
    && body.amount <= 2147483647
    && typeof body.providerToken === 'string'
    && !!body.providerToken;
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return response(405, { error: 'Method not allowed.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    console.error('Edge Function is missing required Supabase configuration or authorization.');
    return response(500, { error: 'Bid service is not configured.' });
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return response(400, { error: 'Request body must be valid JSON.' });
  }

  if (!isPlaceBidRequest(parsedBody)) {
    return response(400, { error: 'Auction, currency, positive integer amount, and Discord session are required.' });
  }
  const body = parsedBody;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return response(401, { error: 'Sign in again before placing a bid.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auction, error: auctionError } = await adminClient
    .from('auctions')
    .select('id, guild_id, seller_discord_id, status, end_time')
    .eq('id', body.auctionId)
    .maybeSingle();

  if (auctionError) {
    console.error('Failed to load auction for bid validation:', auctionError.message);
    return response(500, { error: 'Could not validate this auction.' });
  }
  if (!auction) {
    return response(404, { error: 'Auction was not found.' });
  }
  if (auction.seller_discord_id === user.id) {
    return response(403, { error: 'You cannot bid on your own auction.' });
  }
  if (auction.status !== 'ACTIVE' || new Date(auction.end_time).getTime() <= Date.now()) {
    return response(409, { error: 'This auction is no longer accepting bids.' });
  }

  let discordUserResponse: Response;
  try {
    discordUserResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${body.providerToken}` },
    });
  } catch (error) {
    console.error('Discord identity verification request failed:', error);
    return response(502, { error: 'Could not verify your Discord session. Please try again.' });
  }
  if (!discordUserResponse.ok) {
    return response(401, { error: 'Your Discord session expired. Sign in with Discord again.' });
  }

  let discordUser: DiscordUser;
  try {
    discordUser = await discordUserResponse.json() as DiscordUser;
  } catch (error) {
    console.error('Discord identity response was not valid JSON:', error);
    return response(502, { error: 'Discord returned an invalid user profile.' });
  }
  if (!discordUser.id || !discordUser.username) {
    return response(502, { error: 'Discord returned an invalid user profile.' });
  }

  const discordIdentity = user.identities?.find((identity) => identity.provider === 'discord');
  const identityData = discordIdentity?.identity_data;
  const linkedDiscordId = identityData?.['provider_id']
    ?? identityData?.['sub']
    ?? identityData?.['id']
    ?? user.user_metadata?.['provider_id']
    ?? user.user_metadata?.['sub']
    ?? user.user_metadata?.['id'];
  if (typeof linkedDiscordId !== 'string' || linkedDiscordId !== discordUser.id) {
    return response(403, { error: 'The Discord account must match the account used to sign in.' });
  }

  let isGuildMember = false;
  let after: string | null = null;
  try {
    do {
      const guildsUrl = new URL('https://discord.com/api/v10/users/@me/guilds');
      guildsUrl.searchParams.set('limit', '200');
      if (after) {
        guildsUrl.searchParams.set('after', after);
      }

      const guildsResponse = await fetch(guildsUrl, {
        headers: { Authorization: `Bearer ${body.providerToken}` },
      });
      if (!guildsResponse.ok) {
        console.error('Discord guild membership verification failed:', guildsResponse.status);
        return response(502, { error: 'Could not verify your Discord server membership.' });
      }

      const guilds = await guildsResponse.json() as DiscordGuild[];
      isGuildMember = guilds.some((guild) => guild.id === auction.guild_id);
      if (isGuildMember || guilds.length < 200) {
        break;
      }
      const nextAfter = guilds[guilds.length - 1]?.id ?? null;
      if (!nextAfter || nextAfter === after) {
        break;
      }
      after = nextAfter;
    } while (after);
  } catch (error) {
    console.error('Discord guild membership verification request failed:', error);
    return response(502, { error: 'Could not verify your Discord server membership.' });
  }

  if (!isGuildMember) {
    return response(403, { error: 'Join this Discord server before placing a bid.' });
  }

  const avatar = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : null;
  const { data: bidId, error: bidError } = await adminClient.rpc('place_auction_bid', {
    p_auction_id: body.auctionId,
    p_auth_user_id: user.id,
    p_bidder_discord_id: discordUser.id,
    p_bidder_name: discordUser.global_name || discordUser.username,
    p_bidder_avatar: avatar,
    p_currency_symbol: body.currencySymbol,
    p_amount: body.amount,
  });

  if (bidError) {
    console.error('Database rejected bid:', bidError.message);
    return response(409, { error: bidError.message });
  }

  return response(201, { bidId });
});
