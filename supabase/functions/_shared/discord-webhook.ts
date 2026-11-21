export function parseDiscordWebhookUrl(value: string): URL | null {
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
