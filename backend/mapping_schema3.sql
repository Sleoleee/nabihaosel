-- SPV -> Kode C (effective-dated): SPV memegang Kode C mana saja, bisa berpindah antar-SPV.
-- Satu Kode C punya satu SPV pada satu waktu (seperti map_c_salesperson).
-- Jalankan di Supabase SQL editor. Aman di-rerun.

CREATE TABLE IF NOT EXISTS map_c_spv (
    kode_c      TEXT NOT NULL,
    spv         TEXT NOT NULL,
    valid_from  DATE NOT NULL,
    valid_to    DATE,                 -- NULL = masih berlaku
    PRIMARY KEY (kode_c, valid_from)
);
CREATE INDEX IF NOT EXISTS idx_mcspv_kode ON map_c_spv(kode_c);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
