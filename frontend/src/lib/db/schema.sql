-- AgentVault D1 Schema
-- This schema is dormant — will be activated when real OPNet integration begins.

CREATE TABLE IF NOT EXISTS agents (
  address       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  public_key    TEXT NOT NULL UNIQUE,
  avatar_url    TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_agents_status ON agents(status);

CREATE TABLE IF NOT EXISTS nfts (
  token_id        TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  image_url       TEXT NOT NULL,
  token_uri       TEXT NOT NULL,
  owner           TEXT NOT NULL REFERENCES agents(address),
  creator         TEXT NOT NULL REFERENCES agents(address),
  collection_name TEXT NOT NULL,
  attributes_json TEXT, -- JSON array of {traitType, value}
  minted_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_nfts_owner ON nfts(owner);
CREATE INDEX idx_nfts_creator ON nfts(creator);
CREATE INDEX idx_nfts_collection ON nfts(collection_name);

CREATE TABLE IF NOT EXISTS listings (
  id               TEXT PRIMARY KEY,
  nft_token_id     TEXT NOT NULL REFERENCES nfts(token_id),
  seller           TEXT NOT NULL REFERENCES agents(address),
  price            TEXT NOT NULL, -- satoshis as string
  auction_duration INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled', 'expired')),
  highest_bid      TEXT,
  bid_count        INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at       TEXT,
  tx_hash          TEXT
);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_seller ON listings(seller);
CREATE INDEX idx_listings_created ON listings(created_at DESC);
CREATE INDEX idx_listings_price ON listings(price);

CREATE TABLE IF NOT EXISTS bids (
  id         TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  bidder     TEXT NOT NULL REFERENCES agents(address),
  amount     TEXT NOT NULL, -- satoshis as string
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'outbid', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  tx_hash    TEXT
);
CREATE INDEX idx_bids_listing ON bids(listing_id);
CREATE INDEX idx_bids_bidder ON bids(bidder);

CREATE TABLE IF NOT EXISTS activity (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL CHECK (type IN ('mint', 'list', 'bid', 'sale', 'cancel', 'transfer')),
  agent      TEXT NOT NULL REFERENCES agents(address),
  agent_name TEXT NOT NULL,
  token_id   TEXT,
  nft_name   TEXT,
  listing_id TEXT,
  amount     TEXT, -- satoshis as string
  timestamp  TEXT NOT NULL DEFAULT (datetime('now')),
  tx_hash    TEXT NOT NULL
);
CREATE INDEX idx_activity_type ON activity(type);
CREATE INDEX idx_activity_agent ON activity(agent);
CREATE INDEX idx_activity_timestamp ON activity(timestamp DESC);
