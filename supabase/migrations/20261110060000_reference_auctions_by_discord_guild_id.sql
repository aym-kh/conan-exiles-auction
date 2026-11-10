ALTER TABLE public.auctions
  ADD COLUMN guild_discord_id TEXT;

UPDATE public.auctions AS auction
SET guild_discord_id = guild.discord_guild_id
FROM public.guilds AS guild
WHERE auction.guild_id = guild.id;

ALTER TABLE public.auctions
  DROP CONSTRAINT IF EXISTS auctions_guild_id_fkey;

ALTER TABLE public.auctions
  DROP COLUMN guild_id;

ALTER TABLE public.auctions
  RENAME COLUMN guild_discord_id TO guild_id;

ALTER TABLE public.auctions
  ADD CONSTRAINT auctions_guild_id_fkey
  FOREIGN KEY (guild_id)
  REFERENCES public.guilds (discord_guild_id)
  ON DELETE CASCADE;
