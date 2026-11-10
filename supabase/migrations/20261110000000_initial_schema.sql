-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--------------------------------------------------------------------------------
-- 1. GUILDS TABLE (Discord Servers)
--------------------------------------------------------------------------------
CREATE TABLE guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_guild_id TEXT UNIQUE NOT NULL,
  guild_name TEXT NOT NULL,
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE guilds ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Guilds
-- Anyone can view guild configs
CREATE POLICY "Allow public read access on guilds"
  ON guilds FOR SELECT
  USING (true);

-- Only authenticated users can insert/update guilds (or handled via service role / manager checks)
CREATE POLICY "Allow authenticated users to manage guilds"
  ON guilds FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


--------------------------------------------------------------------------------
-- 2. AUCTIONS TABLE
--------------------------------------------------------------------------------
CREATE TABLE auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
  seller_discord_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_blind BOOLEAN DEFAULT false,
  currencies JSONB NOT NULL, -- Holds custom currency weights, e.g., [{"symbol": "BC", "weight": 100}]
  status TEXT CHECK (status IN ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED')) DEFAULT 'ACTIVE',
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Auctions
-- Everyone can view active/ended auctions
CREATE POLICY "Allow public read access on auctions"
  ON auctions FOR SELECT
  USING (true);

-- Authenticated users (managers) can create and update auctions
CREATE POLICY "Allow authenticated users to create auctions"
  ON auctions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update auctions"
  ON auctions FOR UPDATE
  TO authenticated
  USING (true);


--------------------------------------------------------------------------------
-- 3. BIDS TABLE
--------------------------------------------------------------------------------
CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID REFERENCES auctions(id) ON DELETE CASCADE,
  bidder_discord_id TEXT NOT NULL,
  bidder_name TEXT NOT NULL,
  bidder_avatar TEXT,
  currency_symbol TEXT NOT NULL,
  amount INT NOT NULL,
  calculated_weight INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Bids
-- Everyone can view bids for transparency
CREATE POLICY "Allow public read access on bids"
  ON bids FOR SELECT
  USING (true);

-- Authenticated users can insert a bid
CREATE POLICY "Allow authenticated users to place bids"
  ON bids FOR INSERT
  TO authenticated
  WITH CHECK (true);