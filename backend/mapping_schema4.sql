-- Opsi C: label pemegang customer = pemegang Kode C SAAT INI + riwayat pemegang (rentang tanggal).
-- Jalankan di Supabase SQL editor sekali, lalu rebuild (python build_analytics.py).

ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS kode_c               TEXT;
ALTER TABLE dim_customer ADD COLUMN IF NOT EXISTS salesperson_history  JSONB;

CREATE INDEX IF NOT EXISTS idx_dc_kode_c ON dim_customer(kode_c);
