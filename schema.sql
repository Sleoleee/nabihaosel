-- Tabel utama transaksi
CREATE TABLE IF NOT EXISTS transactions (
  id                    BIGSERIAL PRIMARY KEY,
  document_number       BIGINT,
  posting_date          DATE,
  due_date              DATE,
  customer_code         TEXT,
  customer_name         TEXT,
  item_no               TEXT,
  item_description      TEXT,
  kategori              TEXT,
  warehouse_code        TEXT,
  quantity              INTEGER,
  unit                  TEXT,
  harga_awal            NUMERIC,
  disc_per_row          NUMERIC,
  harga_jual            NUMERIC,
  row_total             NUMERIC,
  disc_for_document     NUMERIC,
  new_row_total         NUMERIC,
  slp_name              TEXT,
  branch                TEXT,
  status_payment        TEXT,
  year                  INTEGER,
  uploaded_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk query cepat
CREATE INDEX IF NOT EXISTS idx_transactions_posting_date ON transactions(posting_date);
CREATE INDEX IF NOT EXISTS idx_transactions_year ON transactions(year);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_code ON transactions(customer_code);
CREATE INDEX IF NOT EXISTS idx_transactions_kategori ON transactions(kategori);
CREATE INDEX IF NOT EXISTS idx_transactions_slp_name ON transactions(slp_name);

-- Tabel riwayat upload
CREATE TABLE IF NOT EXISTS upload_history (
  id            BIGSERIAL PRIMARY KEY,
  filename      TEXT,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW(),
  rows_imported INTEGER,
  rows_skipped  INTEGER,
  years_covered TEXT[],
  replace_mode  BOOLEAN
);
