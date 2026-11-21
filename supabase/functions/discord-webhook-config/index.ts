import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Action = 'status' | 'save' | 'delete';

interface ConfigRequest {
  action: Action;
  discordGuildId: string;
  providerToken: string;
  webhookUrl?: string;
}

interface DiscordUser {
  id: string;
}

interface DiscordGuild {
  id: string;
  owner: boolean;
}

const isAction = (value: unknown): value is Action =>
  value === 'status' || value === 'save' || value === 'delete';

const response = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isSnowflake = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{17,20}$/.test(value);

function parseDiscordWebhookUrl(value: string): URL | null {
  if (value.length > 2048) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:'
      || !['discord.com', 'discordapp.com'].includes(url.hostname)
      || (url.port !== '' && url.port !== '443')
      || url.username !== ''
      || url.password !== ''
      || url.search !== ''
      || url.hash !== ''
      || !/^\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function verifyDiscordOwner(
  providerToken: string,
  discordGuildId: string,
  linkedDiscordId: string | null,
): Promise<boolean> {
  const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${providerToken}` },
  });
  if (!userResponse.ok) {
    return false;
  }

  const discordUser = await userResponse.json() as DiscordUser;
  if (!discordUser.id || linkedDiscordId !== discordUser.id) {
    return false;
  }

  let after: string | null = null;
  do {
    const url = new URL('https://discord.com/api/v10/users/@me/guilds');
    url.searchParams.set('limit', '200');
    if (after) {
      url.searchParams.set('after', after);
    }

    const guildResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!guildResponse.ok) {
      throw new Error('Could not verify Discord server ownership.');
    }

    const guilds = await guildResponse.json() as DiscordGuild[];
    const targetGuild = guilds.find((guild) => guild.id === discordGuildId);
    if (targetGuild) {
      return targetGuild.owner === true;
    }
    if (guilds.length < 200) {
      return false;
    }

    const nextAfter = guilds[guilds.length - 1]?.id ?? null;
    if (!nextAfter || nextAfter === after) {
      return false;
    }
    after = nextAfter;
  } while (after);

  return false;
}

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
    console.error('Webhook configuration function is missing required Supabase configuration or authorization.');
    return response(500, { error: 'Webhook configuration is not available.' });
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return response(400, { error: 'Request body must be valid JSON.' });
  }
  if (!isRecord(parsedBody)) {
    return response(400, { error: 'Invalid webhook configuration request.' });
  }

  const { action, discordGuildId, providerToken, webhookUrl } = parsedBody;
  if (
    !isAction(action)
    || !isSnowflake(discordGuildId)
    || typeof providerToken !== 'string'
    || providerToken.length === 0
    || providerToken.length > 4096
    || (action === 'save' && typeof webhookUrl !== 'string')
  ) {
    return response(400, { error: 'Invalid webhook configuration request.' });
  }
  const configRequest: ConfigRequest = {
    action,
    discordGuildId,
    providerToken,
    ...(typeof webhookUrl === 'string' ? { webhookUrl } : {}),
  };

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return response(401, { error: 'Sign in again before configuring notifications.' });
  }

  const discordIdentity = user.identities?.find((identity) => identity.provider === 'discord');
  const identityData = discordIdentity?.identity_data;
  const linkedDiscordId = identityData?.['provider_id']
    ?? identityData?.['sub']
    ?? identityData?.['id']
    ?? user.user_metadata?.['provider_id']
    ?? user.user_metadata?.['sub']
    ?? user.user_metadata?.['id'];

  let isOwner: boolean;
  try {
    isOwner = await verifyDiscordOwner(
      configRequest.providerToken,
      configRequest.discordGuildId,
      typeof linkedDiscordId === 'string' ? linkedDiscordId : null,
    );
  } catch (error) {
    console.error('Discord server ownership verification failed:', error);
    return response(502, { error: 'Could not verify Discord server ownership.' });
  }
  if (!isOwner) {
    return response(403, { error: 'Only the Discord server owner can configure this webhook.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (configRequest.action === 'status') {
    const { data, error } = await adminClient
      .from('discord_webhook_settings')
      .select('discord_guild_id')
      .eq('discord_guild_id', configRequest.discordGuildId)
      .maybeSingle();
    if (error) {
      console.error('Failed to check Discord webhook configuration:', error.message);
      return response(500, { error: 'Could not check notification settings.' });
    }
    return response(200, { configured: !!data });
  }

  if (configRequest.action === 'delete') {
    const { error } = await adminClient
      .from('discord_webhook_settings')
      .delete()
      .eq('discord_guild_id', configRequest.discordGuildId);
    if (error) {
      console.error('Failed to remove Discord webhook configuration:', error.message);
      return response(500, { error: 'Could not disable Discord notifications.' });
    }
    return response(200, { configured: false });
  }

  const webhook = parseDiscordWebhookUrl(configRequest.webhookUrl ?? '');
  if (!webhook) {
    return response(400, { error: 'Enter a valid Discord webhook URL.' });
  }

  const inspectController = new AbortController();
  const inspectTimeout = setTimeout(() => inspectController.abort(), 10_000);
  let webhookInfoResponse: Response;
  try {
    webhookInfoResponse = await fetch(webhook, {
      method: 'GET',
      redirect: 'manual',
      signal: inspectController.signal,
    });
  } catch {
    return response(502, { error: 'Could not validate that Discord webhook.' });
  } finally {
    clearTimeout(inspectTimeout);
  }
  if (!webhookInfoResponse.ok) {
    return response(400, { error: 'Discord rejected that webhook URL. Check that it is still active.' });
  }

  let webhookInfo: unknown;
  try {
    webhookInfo = await webhookInfoResponse.json();
  } catch {
    return response(502, { error: 'Discord returned an invalid webhook response.' });
  }
  if (!isRecord(webhookInfo) || webhookInfo.guild_id !== configRequest.discordGuildId) {
    return response(400, { error: 'That webhook belongs to a different Discord server.' });
  }

  webhook.searchParams.set('wait', 'true');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let testResponse: Response;
  try {
    testResponse = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: 'Auction notifications connected',
          description: 'This channel is ready to receive auction updates.',
          color: 0xb88d51,
        }],
        allowed_mentions: { parse: [] },
      }),
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch {
    return response(502, { error: 'Could not send a test message to that Discord webhook.' });
  } finally {
    clearTimeout(timeout);
  }

  if (testResponse.status === 429) {
    return response(502, { error: 'Discord rate limited the test. Wait a moment and try again.' });
  }
  if (!testResponse.ok) {
    return response(400, { error: 'Discord rejected the test message. Check the webhook URL and channel permissions.' });
  }

  const { error: saveError } = await adminClient
    .from('discord_webhook_settings')
    .upsert({
      discord_guild_id: configRequest.discordGuildId,
      webhook_url: configRequest.webhookUrl,
      configured_by: user.id,
      updated_at: new Date().toISOString(),
    });
  if (saveError) {
    console.error('Failed to save Discord webhook configuration:', saveError.message);
    return response(500, { error: 'The test message was sent, but the webhook could not be saved.' });
  }

  return response(200, { configured: true });
});
