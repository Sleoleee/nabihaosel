-- Mapping atribusi salesperson berbasis Kode C (effective-dated / SCD-2)
-- Jalankan di Supabase SQL editor. Aman di-rerun.
--
-- Konsep:
--   transaksi (customer_code, posting_date)
--     -> map_customer_c  : customer dipegang Kode C apa pada tanggal itu
--     -> map_c_salesperson: Kode C itu dipegang salesperson siapa pada tanggal itu
--   valid_to NULL = masih berlaku (periode terbuka).

CREATE TABLE IF NOT EXISTS map_customer_c (
    customer_code TEXT NOT NULL,
    kode_c        TEXT NOT NULL,
    valid_from    DATE NOT NULL,
    valid_to      DATE,                       -- NULL = s/d kini
    PRIMARY KEY (customer_code, valid_from)
);
CREATE INDEX IF NOT EXISTS idx_mcc_code ON map_customer_c(customer_code);

CREATE TABLE IF NOT EXISTS map_c_salesperson (
    kode_c        TEXT NOT NULL,
    slp_name      TEXT NOT NULL,              -- samakan dgn sp_master.slp_name
    valid_from    DATE NOT NULL,
    valid_to      DATE,
    PRIMARY KEY (kode_c, valid_from)
);
CREATE INDEX IF NOT EXISTS idx_mcs_kode ON map_c_salesperson(kode_c);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
