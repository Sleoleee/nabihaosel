-- Jalankan sekali di Supabase SQL Editor
CREATE TABLE IF NOT EXISTS dashboard_cache (
  cache_key TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
