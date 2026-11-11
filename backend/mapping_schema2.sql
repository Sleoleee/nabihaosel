-- Tambahan mapping (model fleksibel, lepas dari sp_master):
--   kode_c_meta : tandai Kode C non-sales (tak dihitung pencapaian/gap)
--   target_c    : target revenue per Kode C per bulan (slot stabil)
-- Jalankan di Supabase SQL editor. Aman di-rerun.

CREATE TABLE IF NOT EXISTS kode_c_meta (
    kode_c        TEXT PRIMARY KEY,
    is_non_sales  BOOLEAN NOT NULL DEFAULT FALSE,
    catatan       TEXT
);

CREATE TABLE IF NOT EXISTS target_c (
    kode_c   TEXT NOT NULL,
    tahun    INT  NOT NULL,
    bulan    INT  NOT NULL,
    target   NUMERIC NOT NULL DEFAULT 0,
    PRIMARY KEY (kode_c, tahun, bulan)
);
CREATE INDEX IF NOT EXISTS idx_target_c ON target_c(tahun);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
