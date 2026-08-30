-- =====================================================================
-- LAPISAN ANALITIK (PROMPT 1) — jalankan sekali di Supabase SQL Editor.
-- fact_sales_line & dim_item = VIEW (tanpa duplikasi data, selalu fresh).
-- dim_customer, dim_salesperson, agg_* = tabel asli, diisi build_analytics.py.
-- =====================================================================

-- ---------- VIEW: fact_sales_line (transaksi bersih level baris) ----------
-- channel & is_produk_inti dihitung via CASE agar cocok dengan config.py.
CREATE OR REPLACE VIEW fact_sales_line AS
SELECT
  id,
  document_number,
  posting_date,
  year                             AS tahun,
  EXTRACT(MONTH FROM posting_date)::INT AS bulan,
  customer_code,
  customer_name,
  item_no,
  item_description                 AS item_desc,
  kategori,
  quantity,
  unit,
  harga_awal,
  harga_jual,
  disc_per_row                     AS disc_row_pct,
  disc_for_document                AS disc_doc_pct,
  new_row_total                    AS revenue,
  slp_name,
  branch,
  CASE
    WHEN branch IS NULL THEN 'OTHER CHANNEL'
    WHEN upper(regexp_replace(branch, '^[0-9]+\.\s*', '')) IN ('SHOPEE','TIKTOK','TKPD','BLIBLI','LAZADA') THEN 'E-Commerce'
    WHEN upper(regexp_replace(branch, '^[0-9]+\.\s*', '')) IN ('ASEMKA','TENGSE','DOMPET') THEN 'SUKSES JAYA'
    WHEN upper(regexp_replace(branch, '^[0-9]+\.\s*', '')) LIKE 'NAMI%' THEN 'NAMI'
    WHEN upper(regexp_replace(branch, '^[0-9]+\.\s*', '')) = 'BLOOMIE' THEN 'BLOOMIE'
    WHEN upper(regexp_replace(branch, '^[0-9]+\.\s*', '')) = 'K25' THEN 'K25'
    ELSE 'OTHER CHANNEL'
  END                              AS channel,
  CASE WHEN upper(trim(kategori)) IN ('MARKETPLACE','BIAYA PACKAGING','TAS PAPERBAG')
       THEN FALSE ELSE TRUE END    AS is_produk_inti
FROM transactions
WHERE year >= 2023;

-- ---------- VIEW: dim_item ----------
CREATE OR REPLACE VIEW dim_item AS
SELECT
  item_no,
  MAX(item_description) AS item_desc,
  MAX(kategori)         AS kategori,
  bool_or(upper(trim(kategori)) NOT IN ('MARKETPLACE','BIAYA PACKAGING','TAS PAPERBAG')) AS is_produk_inti,
  MIN(posting_date)     AS first_sold,
  MAX(posting_date)     AS last_sold
FROM transactions
WHERE year >= 2023 AND item_no IS NOT NULL
GROUP BY item_no;

-- ---------- dim_customer ----------
CREATE TABLE IF NOT EXISTS dim_customer (
  customer_code                TEXT PRIMARY KEY,
  customer_name                TEXT,
  first_order_date             DATE,
  last_order_date              DATE,
  total_revenue                NUMERIC,
  jumlah_bulan_aktif           INT,
  avg_spending_per_month_active NUMERIC,
  tier                         TEXT,
  interval_normal_hari         NUMERIC,   -- MEDIAN jeda hari
  days_since_last_order        INT,
  recency_ratio                NUMERIC,
  frequency                    NUMERIC,
  monetary                     NUMERIC,
  segmen_rfm                   TEXT,
  status                       TEXT,       -- Active / Overdue / Lost
  salesperson_utama            TEXT,
  channel_utama                TEXT,
  revenue_at_risk              NUMERIC,
  jumlah_bills                 INT,
  jumlah_kategori_pernah_dibeli INT
);

-- ---------- dim_salesperson ----------
CREATE TABLE IF NOT EXISTS dim_salesperson (
  slp_name         TEXT PRIMARY KEY,
  spv              TEXT,
  is_tim_inti_k25  BOOLEAN,
  is_non_person    BOOLEAN,
  total_revenue    NUMERIC
);

-- ---------- Agregasi bulanan ----------
DROP TABLE IF EXISTS agg_salesperson_month CASCADE;
CREATE TABLE IF NOT EXISTS agg_salesperson_month (
  slp_name TEXT, tahun INT, bulan INT, channel TEXT,
  revenue NUMERIC, bills INT, aov NUMERIC, customer_aktif INT,
  customer_new INT, customer_repeat INT, customer_reactivated INT, customer_lost INT,
  revenue_new NUMERIC, revenue_repeat NUMERIC, revenue_reactivated NUMERIC, revenue_lost NUMERIC,
  PRIMARY KEY (slp_name, tahun, bulan, channel)
);

DROP TABLE IF EXISTS agg_salesperson_category_month CASCADE;
CREATE TABLE IF NOT EXISTS agg_salesperson_category_month (
  slp_name TEXT, kategori TEXT, tahun INT, bulan INT, channel TEXT,
  revenue NUMERIC, bills INT,
  PRIMARY KEY (slp_name, kategori, tahun, bulan, channel)
);

CREATE TABLE IF NOT EXISTS agg_sku_year (
  item_no TEXT, tahun INT,
  revenue NUMERIC, quantity NUMERIC, unit TEXT, jumlah_customer INT, harga_rata2 NUMERIC,
  PRIMARY KEY (item_no, tahun)
);
CREATE INDEX IF NOT EXISTS idx_skuyear_item ON agg_sku_year(item_no);
CREATE INDEX IF NOT EXISTS idx_skuyear_th   ON agg_sku_year(tahun);

DROP TABLE IF EXISTS agg_category_month CASCADE;
CREATE TABLE IF NOT EXISTS agg_category_month (
  kategori TEXT, tahun INT, bulan INT, channel TEXT,
  revenue NUMERIC, bills INT, customer_aktif INT,
  PRIMARY KEY (kategori, tahun, bulan, channel)
);

CREATE TABLE IF NOT EXISTS agg_sku_month (
  item_no TEXT, tahun INT, bulan INT,
  revenue NUMERIC, quantity NUMERIC, unit TEXT, jumlah_customer INT, harga_rata2 NUMERIC,
  PRIMARY KEY (item_no, tahun, bulan)
);

DROP TABLE IF EXISTS agg_customer_month CASCADE;
CREATE TABLE IF NOT EXISTS agg_customer_month (
  customer_code TEXT, tahun INT, bulan INT, channel TEXT,
  revenue NUMERIC, bills INT, status_lifecycle TEXT,
  PRIMARY KEY (customer_code, tahun, bulan, channel)
);

CREATE TABLE IF NOT EXISTS agg_customer_category (
  customer_code TEXT, kategori TEXT,
  revenue NUMERIC, qty_bills INT, last_purchase_date DATE,
  PRIMARY KEY (customer_code, kategori)
);

CREATE TABLE IF NOT EXISTS agg_category_pairing (
  kategori_a TEXT, kategori_b TEXT, tahun INT,
  jumlah_nota_bersama INT, support NUMERIC, confidence NUMERIC, lift NUMERIC,
  PRIMARY KEY (kategori_a, kategori_b, tahun)
);

CREATE TABLE IF NOT EXISTS agg_cohort_retention (
  cohort_bulan TEXT, bulan_ke_n INT,
  customer_aktif INT, revenue NUMERIC, pct_retained NUMERIC,
  PRIMARY KEY (cohort_bulan, bulan_ke_n)
);

CREATE TABLE IF NOT EXISTS agg_discount_category_month (
  kategori TEXT, tahun INT, bulan INT,
  revenue_gross NUMERIC, revenue_net NUMERIC, disc_amount NUMERIC, disc_pct_rata2 NUMERIC,
  PRIMARY KEY (kategori, tahun, bulan)
);

-- ---------- Index untuk filter ----------
CREATE INDEX IF NOT EXISTS idx_dc_tier      ON dim_customer(tier);
CREATE INDEX IF NOT EXISTS idx_dc_segmen    ON dim_customer(segmen_rfm);
CREATE INDEX IF NOT EXISTS idx_dc_status    ON dim_customer(status);
CREATE INDEX IF NOT EXISTS idx_dc_slp       ON dim_customer(salesperson_utama);
CREATE INDEX IF NOT EXISTS idx_dc_channel   ON dim_customer(channel_utama);
CREATE INDEX IF NOT EXISTS idx_aspm_slp     ON agg_salesperson_month(slp_name, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_ascm_slp     ON agg_salesperson_category_month(slp_name, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_acm_kat      ON agg_category_month(kategori, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_acm_channel  ON agg_category_month(channel, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_acustm_ch    ON agg_customer_month(channel, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_askum_item   ON agg_sku_month(item_no, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_acustm_cust  ON agg_customer_month(customer_code, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_acustcat_cust ON agg_customer_category(customer_code);
CREATE INDEX IF NOT EXISTS idx_adcm_kat     ON agg_discount_category_month(kategori, tahun, bulan);

-- Index item_no di transaksi -> mempercepat view dim_item (dipakai product-sku)
CREATE INDEX IF NOT EXISTS idx_transactions_item ON transactions(item_no);

-- =====================================================================
-- LAPISAN WILAYAH / TERRITORY (PROMPT 8) — jalankan setelah bagian di atas.
-- =====================================================================

-- ---------- Master customer (snapshot Excel, di-upsert by cardcode) ----------
CREATE TABLE IF NOT EXISTS customer_master (
  customer_code     TEXT PRIMARY KEY,
  customer_name     TEXT,
  create_date       DATE,
  wilayah_raw       TEXT,
  group_name        TEXT,
  pymnt_group       TEXT,
  is_active_master  BOOLEAN,
  master_updated_at TIMESTAMPTZ DEFAULT now()
);
-- Catatan: kolom Phone1 SENGAJA tidak dimuat (data pribadi, tak dipakai analitik).

-- ---------- Referensi provinsi (38 provinsi pasca-2022) ----------
CREATE TABLE IF NOT EXISTS dim_province (
  province_code TEXT PRIMARY KEY,   -- kode BPS 2 digit
  province_name TEXT,
  region_pulau  TEXT,
  geojson_id    TEXT
);

-- ---------- Kolom wilayah tambahan di dim_customer ----------
ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS province_code        TEXT;
ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS province_name        TEXT;
ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS region_pulau         TEXT;
ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS is_territory         BOOLEAN;
ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS non_territory_type   TEXT;
ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS group_name           TEXT;
ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS pymnt_group          TEXT;
ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS create_date          DATE;
ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS is_active_master     BOOLEAN;
ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS umur_customer_bulan  INT;

-- ---------- Agregasi wilayah ----------
DROP TABLE IF EXISTS agg_province_month CASCADE;
CREATE TABLE IF NOT EXISTS agg_province_month (
  province_code TEXT, tahun INT, bulan INT,
  revenue NUMERIC, bills INT, customer_aktif INT, customer_baru INT, customer_lost INT,
  revenue_at_risk NUMERIC, customer_overdue INT, aov NUMERIC,
  PRIMARY KEY (province_code, tahun, bulan)
);

DROP TABLE IF EXISTS agg_province_category CASCADE;
CREATE TABLE IF NOT EXISTS agg_province_category (
  province_code TEXT, kategori TEXT, tahun INT,
  revenue NUMERIC, jumlah_customer INT,
  PRIMARY KEY (province_code, kategori, tahun)
);

DROP TABLE IF EXISTS agg_province_salesperson CASCADE;
CREATE TABLE IF NOT EXISTS agg_province_salesperson (
  province_code TEXT, slp_name TEXT, tahun INT,
  revenue NUMERIC, jumlah_customer INT,
  PRIMARY KEY (province_code, slp_name, tahun)
);

DROP TABLE IF EXISTS dim_province_stats CASCADE;
CREATE TABLE IF NOT EXISTS dim_province_stats (
  province_code TEXT, tahun INT,
  customer_terdaftar INT,   -- kumulatif s/d akhir tahun (create_date)
  customer_aktif INT,       -- >=1 transaksi di tahun tsb
  customer_tidur INT,       -- terdaftar tapi 0 transaksi di tahun tsb
  tingkat_aktivasi NUMERIC,
  PRIMARY KEY (province_code, tahun)
);

CREATE INDEX IF NOT EXISTS idx_dc_province   ON dim_customer(province_code);
CREATE INDEX IF NOT EXISTS idx_dc_territory  ON dim_customer(is_territory);
CREATE INDEX IF NOT EXISTS idx_apm_prov      ON agg_province_month(province_code, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_apc_prov      ON agg_province_category(province_code, tahun);
CREATE INDEX IF NOT EXISTS idx_aps_prov      ON agg_province_salesperson(province_code, tahun);
CREATE INDEX IF NOT EXISTS idx_dps_prov      ON dim_province_stats(province_code, tahun);

-- =====================================================================
-- SETTINGS (grup salesperson & target) — diedit dari menu Setting dashboard.
-- Dibaca live oleh backend; TIDAK perlu build_analytics.py saat diubah.
-- =====================================================================
CREATE TABLE IF NOT EXISTS settings_salesperson_group (
  slp_name TEXT, tahun INT, grup TEXT,
  PRIMARY KEY (slp_name, tahun)
);
CREATE TABLE IF NOT EXISTS settings_target (
  slp_name TEXT, tahun INT, target NUMERIC,
  PRIMARY KEY (slp_name, tahun)
);
CREATE INDEX IF NOT EXISTS idx_ssg_year ON settings_salesperson_group(tahun);
CREATE INDEX IF NOT EXISTS idx_star_year ON settings_target(tahun);

-- ---------- Hak akses: service_role (dipakai build_analytics.py & backend) ----------
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
