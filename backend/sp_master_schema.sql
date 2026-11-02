-- Tabel master Salesperson (sumber kebenaran, dari sp_master.xlsx) + target per-branch.
-- Aman dijalankan ulang; TIDAK men-drop apa pun.

CREATE TABLE IF NOT EXISTS sp_master (
  slp_name      TEXT PRIMARY KEY,
  tipe          TEXT,          -- 'SP lapangan' | 'Staf toko' | 'Generik'
  kode_sp       TEXT,
  tim           TEXT,
  aktif_q4      BOOLEAN,
  branch_utama  TEXT
);

-- Target per SP per BRANCH per bulan (opsi 2b).
CREATE TABLE IF NOT EXISTS settings_target_branch (
  slp_name TEXT, branch TEXT, tahun INT, bulan INT,
  target NUMERIC,
  PRIMARY KEY (slp_name, branch, tahun, bulan)
);
CREATE INDEX IF NOT EXISTS idx_stb_slp ON settings_target_branch(slp_name, tahun);

-- Hak akses service_role (dipakai backend) — WAJIB, seperti analytics_schema.sql.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Kolom hasil resolusi SP di dim_salesperson (diisi build_analytics.py). Aman diulang.
ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS tipe          TEXT;
ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS kode_sp       TEXT;
ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS tim           TEXT;
ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS aktif_q4      BOOLEAN;
ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS branch_utama  TEXT;
ALTER TABLE dim_salesperson ADD COLUMN IF NOT EXISTS display_group TEXT;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
