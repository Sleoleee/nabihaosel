-- Revisi meeting #1: kategori favorit customer + health per salesperson.
-- Aman diulang; tanpa DROP.
ALTER TABLE dim_customer     ADD COLUMN IF NOT EXISTS kategori_favorit TEXT;
ALTER TABLE dim_salesperson  ADD COLUMN IF NOT EXISTS first_txn        DATE;
ALTER TABLE dim_salesperson  ADD COLUMN IF NOT EXISTS tenure_bulan     INT;
ALTER TABLE dim_salesperson  ADD COLUMN IF NOT EXISTS n_customer       INT;
ALTER TABLE dim_salesperson  ADD COLUMN IF NOT EXISTS n_aktif          INT;
ALTER TABLE dim_salesperson  ADD COLUMN IF NOT EXISTS n_tidak_aktif    INT;
ALTER TABLE dim_salesperson  ADD COLUMN IF NOT EXISTS n_hilang         INT;
ALTER TABLE dim_salesperson  ADD COLUMN IF NOT EXISTS churn_rate       NUMERIC;
ALTER TABLE dim_salesperson  ADD COLUMN IF NOT EXISTS net_avg_cust     NUMERIC;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
