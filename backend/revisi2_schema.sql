-- Revisi meeting #2: customer tumbuh (YoY) + AOV trend per SP + item favorit customer.
-- Aman diulang; tanpa DROP.
ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS pct_cust_tumbuh NUMERIC;
ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS aov_tahun_ini   NUMERIC;
ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS aov_tahun_lalu  NUMERIC;
ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS aov_trend       NUMERIC;
ALTER TABLE dim_customer    ADD COLUMN IF NOT EXISTS item_favorit      TEXT;
ALTER TABLE dim_customer    ADD COLUMN IF NOT EXISTS item_favorit_desc TEXT;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
