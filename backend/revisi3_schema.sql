-- Revisi #3: sub item favorit per customer (data U_Sub_Item, hanya 2026)
-- Jalankan di Supabase SQL editor sebelum rebuild. Aman di-rerun (IF NOT EXISTS).

ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS sub_item_favorit TEXT;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
