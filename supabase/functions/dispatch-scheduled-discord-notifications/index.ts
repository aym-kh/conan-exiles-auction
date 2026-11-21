import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseDiscordWebhookUrl } from '../_shared/discord-webhook.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface NotificationRow {
  id: string;
  auction_id: string;
  attempts: number;
}

interface AuctionRecord {
  id: string;
  guild_id: string | null;
  title: string;
  status: string;
  end_time: string;
}

interface AuctionImageRecord {
  storage_path: string;
}

type DispatchResult = 'sent' | 'retrying' | 'failed' | 'skipped';

const response = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const truncate = (value: string, maximumLength: number): string =>
  value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value;

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

async function dispatchReminder(
  adminClient: ReturnType<typeof createClient>,
  notification: NotificationRow,
): Promise<DispatchResult> {
  const { data: auction, error: auctionError } = await adminClient
    .from('auctions')
    .select('id, guild_id, title, status, end_time')
    .eq('id', notification.auction_id)
    .maybeSingle() as { data: AuctionRecord | null; error: { message: string } | null };
  if (auctionError) {
    throw auctionError;
  }
  if (!auction || auction.status !== 'ACTIVE' || new Date(auction.end_time).getTime() <= Date.now()) {
    await updateOutbox(adminClient, notification.id, {
      status: 'skipped',
      claimed_at: null,
      last_error: 'Auction ended or was cancelled before the reminder was delivered.',
    });
    return 'skipped';
  }
  if (!auction.guild_id) {
    await updateOutbox(adminClient, notification.id, {
      status: 'skipped',
      claimed_at: null,
      last_error: 'Auction is not associated with a Discord server.',
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

  const endTimestamp = Math.floor(new Date(auction.end_time).getTime() / 1000);
  if (!Number.isFinite(endTimestamp)) {
    await updateOutbox(adminClient, notification.id, {
      status: 'failed',
      claimed_at: null,
      last_error: 'Auction end time is invalid.',
    });
    return 'failed';
  }

  const { data: image, error: imageError } = await adminClient
    .from('auction_images')
    .select('storage_path')
    .eq('auction_id', auction.id)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle() as { data: AuctionImageRecord | null; error: { message: string } | null };
  if (imageError) {
    throw imageError;
  }

  const imageUrl = image
    ? adminClient.storage.from('auction-images').getPublicUrl(image.storage_path).data.publicUrl
    : null;
  const embed = {
    title: 'Auction ending soon',
    description: `**${truncate(auction.title || 'Auction', 256)}** ends <t:${endTimestamp}:F> (<t:${endTimestamp}:R>).`,
    color: 0xe0ad49,
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
    footer: { text: 'Conan Exiles Auction' },
  };

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
      `Discord temporarily rejected the reminder (${webhookResponse.status}).`,
      webhookResponse.status === 429 ? 60 : 0,
    );
    return 'retrying';
  }
  if (!webhookResponse.ok) {
    await retryNotification(
      adminClient,
      notification,
      `Discord rejected the reminder (${webhookResponse.status}).`,
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const providedKey = request.headers.get('apikey');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Scheduled Discord dispatcher is missing Supabase configuration.');
    return response(500, { error: 'Scheduled Discord notification delivery is not available.' });
  }
  if (!providedKey || providedKey !== serviceRoleKey) {
    return response(401, { error: 'Unauthorized.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: enqueued, error: enqueueError } = await adminClient
    .rpc('enqueue_due_discord_auction_reminders');
  if (enqueueError) {
    console.error('Failed to enqueue due Discord reminders:', enqueueError.message);
    return response(500, { error: 'Could not queue due Discord reminders.' });
  }
  if (typeof enqueued !== 'number' || !Number.isSafeInteger(enqueued)) {
    console.error('The due Discord reminder count was invalid.');
    return response(500, { error: 'Could not queue due Discord reminders.' });
  }

  const { data: notifications, error: claimError } = await adminClient
    .rpc('claim_due_discord_auction_reminders', { p_limit: 10 }) as {
      data: NotificationRow[] | null;
      error: { message: string } | null;
    };
  if (claimError) {
    console.error('Failed to claim scheduled Discord reminders:', claimError.message);
    return response(500, { error: 'Could not load pending Discord reminders.' });
  }

  const counts = { sent: 0, retrying: 0, failed: 0, skipped: 0 };
  for (const notification of notifications ?? []) {
    try {
      const result = await dispatchReminder(adminClient, notification);
      counts[result]++;
    } catch (error) {
      console.error(`Failed to dispatch Discord reminder ${notification.id}:`, error);
      try {
        await retryNotification(adminClient, notification, 'Reminder delivery could not be completed.');
        counts.retrying++;
      } catch (retryError) {
        console.error(`Failed to reschedule Discord reminder ${notification.id}:`, retryError);
        return response(500, { error: 'Could not reschedule a pending Discord reminder.' });
      }
    }
  }

  return response(200, { ...counts, enqueued });
});
