import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getDiscordGuildIds } from '../_shared/discord-guilds.ts';
import { parseDiscordWebhookUrl } from '../_shared/discord-webhook.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface NotificationRow {
  id: string;
  auction_id: string;
  attempts: number;
  event_type: 'auction_created' | 'bid_placed';
  bid_id: string | null;
}

interface AuctionRecord {
  id: string;
  guild_id: string | null;
  seller_discord_id: string;
  title: string;
  description: string | null;
  status: string;
  bid_visibility: 'open' | 'anonymous' | 'sealed';
  end_time: string;
  currencies: unknown;
}

interface AuctionItemRecord {
  title: string;
  sort_order: number;
}

interface BidRecord {
  item_id: string | null;
  bidder_discord_id: string;
  currency_symbol: string;
  amount: number;
  calculated_weight: number;
  is_sealed_offer: boolean;
  bidder_name?: string | null;
  bidder_avatar?: string | null;
}

interface AuctionItemTitle {
  title: string;
}

interface CurrencyRecord {
  symbol: string;
  weight: number;
}

type DispatchResult = 'sent' | 'retrying' | 'failed' | 'skipped';
type NotificationEventType = 'auction_created' | 'bid_placed';

const response = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isUuid = (value: unknown): value is string =>
  typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isNotificationEventType = (value: unknown): value is NotificationEventType =>
  value === 'auction_created' || value === 'bid_placed';

const truncate = (value: string, maximumLength: number): string =>
  value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value;

const formatCurrency = (symbol: string): string =>
  symbol.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

const formatAuctionEmbed = (
  auction: AuctionRecord,
  items: AuctionItemRecord[],
  imageUrl: string | null,
) => {
  const endTimestamp = Math.floor(new Date(auction.end_time).getTime() / 1000);
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: 'Bidding format',
      value: auction.bid_visibility.charAt(0).toUpperCase() + auction.bid_visibility.slice(1),
      inline: true,
    },
    {
      name: 'Ends',
      value: Number.isFinite(endTimestamp) ? `<t:${endTimestamp}:F>\n<t:${endTimestamp}:R>` : 'See auction page',
      inline: true,
    },
  ];

  if (Array.isArray(auction.currencies)) {
    const currencies = auction.currencies
      .filter((currency): currency is CurrencyRecord =>
        typeof currency === 'object'
        && currency !== null
        && 'symbol' in currency
        && typeof currency.symbol === 'string'
        && 'weight' in currency
        && typeof currency.weight === 'number')
      .map((currency) => `${formatCurrency(currency.symbol)} (weight ${currency.weight})`);
    if (currencies.length > 0) {
      fields.push({ name: 'Accepted currencies', value: truncate(currencies.join('\n'), 1024) });
    }
  }

  if (items.length > 0) {
    const itemList = items
      .map((item) => `- ${truncate(item.title, 100)}`)
      .join('\n');
    fields.push({ name: 'Items', value: truncate(itemList, 1024) });
  }

  return {
    title: truncate(auction.title || 'New auction', 256),
    description: truncate(auction.description?.trim() || 'A new auction is open for bidding.', 2000),
    color: 0xb88d51,
    fields,
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
    footer: { text: 'Conan Exiles Auction' },
  };
};

const formatBidEmbed = (
  auction: AuctionRecord,
  bid: BidRecord,
  item: AuctionItemTitle | null,
  imageUrl: string | null,
) => {
  const bidderName = auction.bid_visibility === 'open'
    ? bid.bidder_name?.trim() || 'A bidder'
    : 'Anonymous bidder';
  const endTimestamp = Math.floor(new Date(auction.end_time).getTime() / 1000);
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: 'Bid',
      value: `${bid.amount} ${formatCurrency(bid.currency_symbol)} (weight ${bid.calculated_weight})`,
      inline: true,
    },
    {
      name: 'Bidding format',
      value: auction.bid_visibility === 'open' ? 'Open' : 'Anonymous',
      inline: true,
    },
  ];
  if (item) {
    fields.push({ name: 'Item', value: truncate(item.title, 1024) });
  }
  if (Number.isFinite(endTimestamp)) {
    fields.push({ name: 'Auction ends', value: `<t:${endTimestamp}:R>`, inline: true });
  }

  return {
    title: truncate(`New bid on ${auction.title}`, 256),
    description: `${truncate(bidderName, 256)} placed a bid.`,
    color: 0xb88d51,
    fields,
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
    ...(auction.bid_visibility === 'open' && bid.bidder_avatar
      ? { thumbnail: { url: bid.bidder_avatar } }
      : {}),
    footer: { text: 'Conan Exiles Auction' },
  };
};

async function getAuctionImageUrl(
  adminClient: ReturnType<typeof createClient>,
  auctionId: string,
): Promise<string | null> {
  const { data: image, error } = await adminClient
    .from('auction_images')
    .select('storage_path')
    .eq('auction_id', auctionId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle() as { data: { storage_path: string } | null; error: { message: string } | null };
  if (error) {
    throw error;
  }
  return image
    ? adminClient.storage.from('auction-images').getPublicUrl(image.storage_path).data.publicUrl
    : null;
}

async function updateOutbox(
  adminClient: ReturnType<typeof createClient>,
  notificationId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await adminClient
    .from('discord_notification_outbox')
    .update(values)
    .eq('id', notificationId)
    .eq('status', 'processing');
  if (error) {
    throw error;
  }
}

async function retryNotification(
  adminClient: ReturnType<typeof createClient>,
  notification: NotificationRow,
  errorMessage: string,
  minimumDelaySeconds = 0,
): Promise<void> {
  const backoffSeconds = Math.min(60 * 2 ** Math.min(notification.attempts - 1, 8), 21_600);
  const delaySeconds = Math.max(backoffSeconds, minimumDelaySeconds);
  await updateOutbox(adminClient, notification.id, {
    status: 'pending',
    claimed_at: null,
    next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    last_error: truncate(errorMessage, 500),
  });
}

async function dispatchNotification(
  adminClient: ReturnType<typeof createClient>,
  notification: NotificationRow,
  authUserId: string,
  discordUserId: string,
  discordGuildIds: Set<string>,
): Promise<DispatchResult> {
  const { data: auction, error: auctionError } = await adminClient
    .from('auctions')
    .select('id, guild_id, seller_discord_id, title, description, status, bid_visibility, end_time, currencies')
    .eq('id', notification.auction_id)
    .maybeSingle() as { data: AuctionRecord | null; error: { message: string } | null };
  if (auctionError) {
    throw auctionError;
  }
  if (!auction) {
    await updateOutbox(adminClient, notification.id, {
      status: 'skipped',
      claimed_at: null,
      last_error: 'Auction is no longer available to its seller.',
    });
    return 'skipped';
  }
  if (notification.event_type === 'auction_created' && auction.seller_discord_id !== authUserId) {
    await updateOutbox(adminClient, notification.id, {
      status: 'skipped',
      claimed_at: null,
      last_error: 'Only the auction creator can dispatch its creation notification.',
    });
    return 'skipped';
  }
  if (auction.status === 'CANCELLED') {
    await updateOutbox(adminClient, notification.id, {
      status: 'skipped',
      claimed_at: null,
      last_error: 'Auction was cancelled before notification delivery.',
    });
    return 'skipped';
  }
  if (!auction.guild_id || !discordGuildIds.has(auction.guild_id)) {
    await updateOutbox(adminClient, notification.id, {
      status: 'skipped',
      claimed_at: null,
      last_error: 'Auction creator is no longer a member of this Discord server.',
    });
    return 'skipped';
  }

  const { data: settings, error: settingsError } = await adminClient
    .from('discord_webhook_settings')
    .select('webhook_url')
    .eq('discord_guild_id', auction.guild_id)
    .maybeSingle() as { data: { webhook_url: string } | null; error: { message: string } | null };
  if (settingsError) {
    throw settingsError;
  }
  if (!settings) {
    await updateOutbox(adminClient, notification.id, {
      status: 'skipped',
      claimed_at: null,
      last_error: 'Discord notifications were disabled before delivery.',
    });
    return 'skipped';
  }

  const webhook = parseDiscordWebhookUrl(settings.webhook_url);
  if (!webhook) {
    await updateOutbox(adminClient, notification.id, {
      status: 'failed',
      claimed_at: null,
      last_error: 'The saved Discord webhook URL is invalid.',
    });
    return 'failed';
  }

  let embed: ReturnType<typeof formatAuctionEmbed> | ReturnType<typeof formatBidEmbed>;
  if (notification.event_type === 'auction_created') {
    if (notification.bid_id) {
      await updateOutbox(adminClient, notification.id, {
        status: 'skipped',
        claimed_at: null,
        last_error: 'Auction notification unexpectedly referenced a bid.',
      });
      return 'skipped';
    }

    const { data: itemsData, error: itemsError } = await adminClient
      .from('auction_items')
      .select('title, sort_order')
      .eq('auction_id', auction.id)
      .order('sort_order', { ascending: true }) as { data: AuctionItemRecord[] | null; error: { message: string } | null };
    if (itemsError) {
      throw itemsError;
    }
    embed = formatAuctionEmbed(auction, itemsData ?? [], await getAuctionImageUrl(adminClient, auction.id));
  } else {
    if (!notification.bid_id || auction.bid_visibility === 'sealed') {
      await updateOutbox(adminClient, notification.id, {
        status: 'skipped',
        claimed_at: null,
        last_error: 'Sealed bids are never sent as live notifications.',
      });
      return 'skipped';
    }

    const bidColumns = auction.bid_visibility === 'open'
      ? 'item_id, bidder_discord_id, currency_symbol, amount, calculated_weight, is_sealed_offer, bidder_name, bidder_avatar'
      : 'item_id, bidder_discord_id, currency_symbol, amount, calculated_weight, is_sealed_offer';
    const { data: bid, error: bidError } = await adminClient
      .from('bids')
      .select(bidColumns)
      .eq('id', notification.bid_id)
      .eq('auction_id', auction.id)
      .maybeSingle() as { data: BidRecord | null; error: { message: string } | null };
    if (bidError) {
      throw bidError;
    }
    if (!bid || bid.is_sealed_offer) {
      await updateOutbox(adminClient, notification.id, {
        status: 'skipped',
        claimed_at: null,
        last_error: 'Bid is not eligible for a live notification.',
      });
      return 'skipped';
    }
    if (auction.seller_discord_id !== authUserId && bid.bidder_discord_id !== discordUserId) {
      await updateOutbox(adminClient, notification.id, {
        status: 'skipped',
        claimed_at: null,
        last_error: 'Only the auction creator or bid author can dispatch this notification.',
      });
      return 'skipped';
    }

    let item: AuctionItemTitle | null = null;
    if (bid.item_id) {
      const { data: itemData, error: itemError } = await adminClient
        .from('auction_items')
        .select('title')
        .eq('id', bid.item_id)
        .eq('auction_id', auction.id)
        .maybeSingle() as { data: AuctionItemTitle | null; error: { message: string } | null };
      if (itemError) {
        throw itemError;
      }
      item = itemData;
    }
    embed = formatBidEmbed(auction, bid, item, await getAuctionImageUrl(adminClient, auction.id));
  }

  webhook.searchParams.set('wait', 'true');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let webhookResponse: Response;
  try {
    webhookResponse = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
        allowed_mentions: { parse: [] },
      }),
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch {
    await retryNotification(adminClient, notification, 'Discord webhook request failed.');
    return 'retrying';
  } finally {
    clearTimeout(timeout);
  }

  if (webhookResponse.status === 429 || webhookResponse.status >= 500) {
    await retryNotification(
      adminClient,
      notification,
      `Discord temporarily rejected the notification (${webhookResponse.status}).`,
      webhookResponse.status === 429 ? 60 : 0,
    );
    return 'retrying';
  }
  if (!webhookResponse.ok) {
    await retryNotification(
      adminClient,
      notification,
      `Discord rejected the notification (${webhookResponse.status}).`,
    );
    return 'retrying';
  }

  await updateOutbox(adminClient, notification.id, {
    status: 'sent',
    claimed_at: null,
    sent_at: new Date().toISOString(),
    last_error: null,
  });
  return 'sent';
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return response(405, { error: 'Method not allowed.' });
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return response(400, { error: 'Request body must be valid JSON.' });
  }
  if (!isRecord(parsedBody)) {
    return response(400, { error: 'Invalid notification dispatch request.' });
  }
  const auctionIdValue = parsedBody['auctionId'];
  const eventTypeValue = parsedBody['eventType'];
  const bidIdValue = parsedBody['bidId'];
  if (
    (auctionIdValue !== undefined && !isUuid(auctionIdValue))
    || (eventTypeValue !== undefined && !isNotificationEventType(eventTypeValue))
    || (bidIdValue !== undefined && !isUuid(bidIdValue))
  ) {
    return response(400, { error: 'Invalid notification dispatch request.' });
  }
  const auctionId = typeof auctionIdValue === 'string' ? auctionIdValue : null;
  const eventType = isNotificationEventType(eventTypeValue) ? eventTypeValue : null;
  const bidId = typeof bidIdValue === 'string' ? bidIdValue : null;
  if (
    (eventType !== null && auctionId === null)
    || (bidId !== null && (eventType !== 'bid_placed' || auctionId === null))
    || (eventType === 'bid_placed' && bidId === null)
  ) {
    return response(400, { error: 'Invalid notification dispatch request.' });
  }
  const providerTokenValue = parsedBody['providerToken'];
  if (
    typeof providerTokenValue !== 'string'
    || providerTokenValue.length === 0
    || providerTokenValue.length > 4096
  ) {
    return response(400, { error: 'A valid Discord session is required.' });
  }
  const providerToken = providerTokenValue;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    console.error('Discord notification dispatcher is missing required Supabase configuration or authorization.');
    return response(500, { error: 'Discord notification delivery is not available.' });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return response(401, { error: 'Sign in again before sending auction notifications.' });
  }

  let discordUserResponse: Response;
  try {
    discordUserResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
  } catch (error) {
    console.error('Discord identity verification request failed:', error);
    return response(502, { error: 'Could not verify your Discord session.' });
  }
  if (!discordUserResponse.ok) {
    return response(401, { error: 'Your Discord session expired. Sign in with Discord again.' });
  }

  let discordUser: unknown;
  try {
    discordUser = await discordUserResponse.json();
  } catch (error) {
    console.error('Discord identity response was not valid JSON:', error);
    return response(502, { error: 'Discord returned an invalid user profile.' });
  }
  if (!isRecord(discordUser) || typeof discordUser['id'] !== 'string') {
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
  const discordUserId = discordUser['id'];
  if (!discordUserId || typeof linkedDiscordId !== 'string' || linkedDiscordId !== discordUserId) {
    return response(403, { error: 'The Discord account must match the account used to sign in.' });
  }

  let discordGuildIds: Set<string>;
  try {
    discordGuildIds = await getDiscordGuildIds(providerToken);
  } catch (error) {
    console.error('Discord server membership verification failed:', error);
    return response(502, { error: 'Could not verify your Discord server membership.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: notifications, error: claimError } = await adminClient
    .rpc('claim_discord_notification_events', {
      p_auth_user_id: user.id,
      p_discord_user_id: discordUserId,
      p_limit: 5,
      p_auction_id: auctionId,
      p_event_type: eventType,
      p_bid_id: bidId,
    }) as { data: NotificationRow[] | null; error: { message: string } | null };
  if (claimError) {
    console.error('Failed to claim Discord notifications:', claimError.message);
    return response(500, { error: 'Could not load pending Discord notifications.' });
  }

  const counts = { sent: 0, retrying: 0, failed: 0, skipped: 0 };
  for (const notification of notifications ?? []) {
    try {
      const result = await dispatchNotification(
        adminClient,
        notification,
        user.id,
        discordUserId,
        discordGuildIds,
      );
      counts[result]++;
    } catch (error) {
      console.error(`Failed to dispatch Discord notification ${notification.id}:`, error);
      try {
        await retryNotification(adminClient, notification, 'Notification delivery could not be completed.');
        counts.retrying++;
      } catch (retryError) {
        console.error(`Failed to reschedule Discord notification ${notification.id}:`, retryError);
        return response(500, { error: 'Could not reschedule a pending Discord notification.' });
      }
    }
  }

  const { data: pending, error: pendingError } = await adminClient
    .rpc('count_discord_notification_events', {
      p_auth_user_id: user.id,
      p_discord_user_id: discordUserId,
      p_auction_id: auctionId,
      p_event_type: eventType,
      p_bid_id: bidId,
    });
  if (pendingError) {
    console.error('Failed to count pending Discord notifications:', pendingError.message);
    return response(500, { error: 'Could not check pending Discord notifications.' });
  }
  if (typeof pending !== 'number' || !Number.isSafeInteger(pending)) {
    console.error('Pending Discord notification count was invalid.');
    return response(500, { error: 'Could not check pending Discord notifications.' });
  }

  return response(200, { ...counts, pending });
});
