interface DiscordGuild {
  id: string;
}

const isDiscordGuild = (value: unknown): value is DiscordGuild =>
  typeof value === 'object'
  && value !== null
  && 'id' in value
  && typeof value.id === 'string';

export async function getDiscordGuildIds(providerToken: string): Promise<Set<string>> {
  const guildIds = new Set<string>();
  let after: string | null = null;

  do {
    const url = new URL('https://discord.com/api/v10/users/@me/guilds');
    url.searchParams.set('limit', '200');
    if (after) {
      url.searchParams.set('after', after);
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!response.ok) {
      throw new Error(`Discord server membership check failed (${response.status}).`);
    }

    const guilds: unknown = await response.json();
    if (!Array.isArray(guilds) || !guilds.every(isDiscordGuild)) {
      throw new Error('Discord returned an invalid server list.');
    }

    for (const guild of guilds) {
      guildIds.add(guild.id);
    }
    if (guilds.length < 200) {
      return guildIds;
    }

    const nextAfter = guilds[guilds.length - 1]?.id ?? null;
    if (!nextAfter || nextAfter === after) {
      return guildIds;
    }
    after = nextAfter;
  } while (after);

  return guildIds;
}
