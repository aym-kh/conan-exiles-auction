# Project Plan: Conan Exiles Discord Auction Web App

## 1. Project Overview & Intent
A lightweight, high-performance web application designed for gaming communities (specifically Conan Exiles servers) to run structured auctions without message bloat in Discord channels. 

The tool resolves non-standard server trade economies by allowing server managers to define custom bidding currencies (e.g., Blood Crystals, Frags of Power, Gold Bars) with normalized numeric weights, automatically validating and sorting bids in real time.

---

## 2. Core Architectural Tech Stack
* **Frontend:** Angular (Latest Standalone Components setup) hosted on Netlify.
* **Backend / Database:** Supabase (PostgreSQL + Row Level Security).
* **Auth:** Native Supabase Auth via Discord OAuth2 (`identify`, `guilds` scopes).
* **Realtime Engine:** Supabase Realtime (PostgreSQL CDC Broadcast on `bids` table).
* **Discord Integration:** Supabase Edge Functions (Deno/TypeScript) or PostgreSQL Database Webhooks via `pg_net` triggered on `INSERT` to dispatch rich Discord Embeds.

---

## 3. Scope & MVP Core Features

### A. Authentication & Roles (Discord OAuth2)
* **Server Manager / Admin (`has_manage_guild`):** Access to historical/ended auctions, current active auctions, creation forms, and manual auction management (close/cancel/extend).
* **Standard User / Bidder:** Clean dashboard displaying **Active Auctions** only and active bidding interfaces.

### B. Dynamic Currency & Weight Engine
* Server managers define custom currency exchange logic during auction setup (e.g., `1 BC = 100 pts`, `1 FRAG = 50 pts`, `1 GB = 10 pts`).
* Frontend and Database evaluate incoming bids using normalized integer calculations:
  $$\text{calculated\_weight} = \text{amount} \times \text{currency.weight}$$
* Bids are rejected if $\text{calculated\_weight} \le \text{current\_highest\_bid.calculated\_weight}$.

### C. Real-Time Bidding & Webhook Sync
* **Web Client:** Direct WebSocket subscription to the `bids` table for zero-refresh dynamic UI updates.
* **Discord Channel Sync:** Automated outbound Webhooks to a configured Discord channel when:
  1. A new auction goes live (`[Bid Here]` embed link).
  2. A higher bid is placed (`Outbid Alert`).
  3. An auction ends (Winner tag-mention summary).

---

## 4. Proposed Database Schema (Supabase / Postgres)

```sql
-- Servers / Guilds Table
CREATE TABLE guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_guild_id TEXT UNIQUE NOT NULL,
  guild_name TEXT NOT NULL,
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auctions Table
CREATE TABLE auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
  seller_discord_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_blind BOOLEAN DEFAULT false,
  currencies JSONB NOT NULL, -- Configured items and weights
  status TEXT CHECK (status IN ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED')) DEFAULT 'ACTIVE',
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bids Table
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
```




## 5. Development Roadmap & Milestones

Phase 1: Database & Auth Setup

[ ] Initialize Supabase project & configure Discord OAuth provider settings.  
[ ] Implement database migrations & apply Row-Level Security (RLS) policies.  
[ ] Create Angular AuthService handling Discord login, token retrieval, and user session state.  

Phase 2: Auction Management UI & Currency Engine

[ ] Build Angular layout: Manager View (Past + Active) vs User View (Active Only).  
[ ] Create "New Auction" form with dynamic key-value rows for Custom Currencies & Weights.  
[ ] Implement bid validation utility using normalized calculations.  

Phase 3: Realtime Engine & Notifications

[ ] Integrate Supabase Realtime listener in Angular AuctionService to stream active bids.  
[ ] Write Supabase Edge Function / pg_net trigger to post formatted embed JSON payloads to Discord Webhooks on INSERT to the bids table.  

Phase 4: Polish & Netlify Deployment

[ ] Deploy frontend build to Netlify with environment variable bindings.  
[ ] End-to-end testing of real-time multi-client bidding and outbid alerts.