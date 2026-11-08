-- Revisi #4: Retention Rate eksplisit per salesperson (YoY)
-- retention_rate = customer yang beli tahun lalu DAN tahun ini ÷ customer yang beli tahun lalu
-- Jalankan di Supabase SQL editor sebelum build_analytics.py. Aman di-rerun.

ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS retention_rate NUMERIC;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
