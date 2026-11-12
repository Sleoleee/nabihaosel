-- Retensi aktif (Opsi 2): % customer yang masih dalam ritme beli (telat <= 2x interval normal).
-- Jalankan di Supabase SQL editor sekali, lalu rebuild (python build_analytics.py).

ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS retensi_aktif DOUBLE PRECISION;
