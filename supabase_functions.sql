-- ============================================================
-- STEP 1: Tambah index yang kurang
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_document_number ON transactions(document_number);
CREATE INDEX IF NOT EXISTS idx_transactions_branch ON transactions(branch);
CREATE INDEX IF NOT EXISTS idx_transactions_year_month ON transactions(year, EXTRACT(MONTH FROM posting_date));

-- ============================================================
-- STEP 2: Fungsi sederhana yang cepat
-- ============================================================

-- Filters (distinct values) - fast karena pakai index
CREATE OR REPLACE FUNCTION get_filters()
RETURNS json AS $$
  SELECT json_build_object(
    'years', (SELECT array_agg(y ORDER BY y DESC) FROM (SELECT DISTINCT year AS y FROM transactions WHERE year IS NOT NULL) t),
    'kategori', (SELECT array_agg(k ORDER BY k) FROM (SELECT DISTINCT kategori AS k FROM transactions WHERE kategori IS NOT NULL) t),
    'branches', (SELECT array_agg(b ORDER BY b) FROM (SELECT DISTINCT branch AS b FROM transactions WHERE branch IS NOT NULL) t)
  );
$$ LANGUAGE sql STABLE;

-- KPI summary
CREATE OR REPLACE FUNCTION get_kpi(
  p_year INT DEFAULT NULL,
  p_month INT DEFAULT NULL,
  p_kategori TEXT DEFAULT NULL,
  p_branch TEXT DEFAULT NULL
)
RETURNS TABLE(revenue NUMERIC, bills BIGINT, customers BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    SUM(t.new_row_total) AS revenue,
    COUNT(DISTINCT t.document_number) AS bills,
    COUNT(DISTINCT t.customer_code) AS customers
  FROM transactions t
  WHERE
    (p_year IS NULL OR t.year = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM t.posting_date) = p_month)
    AND (p_kategori IS NULL OR t.kategori = p_kategori)
    AND (p_branch IS NULL OR t.branch = p_branch);
END;
$$ LANGUAGE plpgsql STABLE;

-- Revenue trend by year and month
CREATE OR REPLACE FUNCTION get_revenue_trend(
  p_year INT DEFAULT NULL,
  p_kategori TEXT DEFAULT NULL,
  p_branch TEXT DEFAULT NULL
)
RETURNS TABLE(year INT, month INT, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.year,
    EXTRACT(MONTH FROM t.posting_date)::INT AS month,
    SUM(t.new_row_total) AS revenue
  FROM transactions t
  WHERE
    (p_year IS NULL OR t.year = p_year)
    AND (p_kategori IS NULL OR t.kategori = p_kategori)
    AND (p_branch IS NULL OR t.branch = p_branch)
    AND t.posting_date IS NOT NULL
  GROUP BY t.year, EXTRACT(MONTH FROM t.posting_date)
  ORDER BY t.year, month;
END;
$$ LANGUAGE plpgsql STABLE;

-- Revenue by kategori
CREATE OR REPLACE FUNCTION get_revenue_by_kategori(
  p_year INT DEFAULT NULL,
  p_month INT DEFAULT NULL,
  p_branch TEXT DEFAULT NULL
)
RETURNS TABLE(kategori TEXT, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(t.kategori, 'Lainnya') AS kategori,
    SUM(t.new_row_total) AS revenue
  FROM transactions t
  WHERE
    (p_year IS NULL OR t.year = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM t.posting_date) = p_month)
    AND (p_branch IS NULL OR t.branch = p_branch)
  GROUP BY COALESCE(t.kategori, 'Lainnya')
  ORDER BY revenue DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Revenue by branch
CREATE OR REPLACE FUNCTION get_revenue_by_branch(
  p_year INT DEFAULT NULL,
  p_month INT DEFAULT NULL,
  p_kategori TEXT DEFAULT NULL
)
RETURNS TABLE(branch TEXT, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(t.branch, 'Lainnya') AS branch,
    SUM(t.new_row_total) AS revenue
  FROM transactions t
  WHERE
    (p_year IS NULL OR t.year = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM t.posting_date) = p_month)
    AND (p_kategori IS NULL OR t.kategori = p_kategori)
  GROUP BY COALESCE(t.branch, 'Lainnya')
  ORDER BY revenue DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Bills and AOV by month
CREATE OR REPLACE FUNCTION get_bills_aov(
  p_year INT DEFAULT NULL,
  p_kategori TEXT DEFAULT NULL,
  p_branch TEXT DEFAULT NULL
)
RETURNS TABLE(month INT, bills BIGINT, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(MONTH FROM t.posting_date)::INT AS month,
    COUNT(DISTINCT t.document_number) AS bills,
    SUM(t.new_row_total) AS revenue
  FROM transactions t
  WHERE
    (p_year IS NULL OR t.year = p_year)
    AND (p_kategori IS NULL OR t.kategori = p_kategori)
    AND (p_branch IS NULL OR t.branch = p_branch)
    AND t.posting_date IS NOT NULL
  GROUP BY EXTRACT(MONTH FROM t.posting_date)
  ORDER BY month;
END;
$$ LANGUAGE plpgsql STABLE;

-- Sales leaderboard
CREATE OR REPLACE FUNCTION get_sales_leaderboard(
  p_year INT DEFAULT NULL,
  p_month INT DEFAULT NULL,
  p_kategori TEXT DEFAULT NULL,
  p_branch TEXT DEFAULT NULL
)
RETURNS TABLE(slp_name TEXT, revenue NUMERIC, bills BIGINT, customers BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.slp_name,
    SUM(t.new_row_total) AS revenue,
    COUNT(DISTINCT t.document_number) AS bills,
    COUNT(DISTINCT t.customer_code) AS customers
  FROM transactions t
  WHERE
    t.slp_name IS NOT NULL
    AND (p_year IS NULL OR t.year = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM t.posting_date) = p_month)
    AND (p_kategori IS NULL OR t.kategori = p_kategori)
    AND (p_branch IS NULL OR t.branch = p_branch)
  GROUP BY t.slp_name
  ORDER BY revenue DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Sales trend by month per salesperson
CREATE OR REPLACE FUNCTION get_sales_trend(
  p_year INT DEFAULT NULL,
  p_kategori TEXT DEFAULT NULL,
  p_branch TEXT DEFAULT NULL
)
RETURNS TABLE(slp_name TEXT, month INT, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.slp_name,
    EXTRACT(MONTH FROM t.posting_date)::INT AS month,
    SUM(t.new_row_total) AS revenue
  FROM transactions t
  WHERE
    t.slp_name IS NOT NULL
    AND t.posting_date IS NOT NULL
    AND (p_year IS NULL OR t.year = p_year)
    AND (p_kategori IS NULL OR t.kategori = p_kategori)
    AND (p_branch IS NULL OR t.branch = p_branch)
  GROUP BY t.slp_name, EXTRACT(MONTH FROM t.posting_date)
  ORDER BY t.slp_name, month;
END;
$$ LANGUAGE plpgsql STABLE;

-- Product trend by month and kategori
CREATE OR REPLACE FUNCTION get_product_trend(
  p_year INT DEFAULT NULL,
  p_branch TEXT DEFAULT NULL
)
RETURNS TABLE(kategori TEXT, month INT, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(t.kategori, 'Lainnya') AS kategori,
    EXTRACT(MONTH FROM t.posting_date)::INT AS month,
    SUM(t.new_row_total) AS revenue
  FROM transactions t
  WHERE
    t.posting_date IS NOT NULL
    AND (p_year IS NULL OR t.year = p_year)
    AND (p_branch IS NULL OR t.branch = p_branch)
  GROUP BY COALESCE(t.kategori, 'Lainnya'), EXTRACT(MONTH FROM t.posting_date)
  ORDER BY kategori, month;
END;
$$ LANGUAGE plpgsql STABLE;

-- Top products
CREATE OR REPLACE FUNCTION get_top_products(
  p_year INT DEFAULT NULL,
  p_month INT DEFAULT NULL,
  p_kategori TEXT DEFAULT NULL,
  p_branch TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE(item_no TEXT, item_description TEXT, kategori TEXT, revenue NUMERIC, quantity NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.item_no,
    t.item_description,
    t.kategori,
    SUM(t.new_row_total) AS revenue,
    SUM(t.quantity) AS quantity
  FROM transactions t
  WHERE
    (p_year IS NULL OR t.year = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM t.posting_date) = p_month)
    AND (p_kategori IS NULL OR t.kategori = p_kategori)
    AND (p_branch IS NULL OR t.branch = p_branch)
  GROUP BY t.item_no, t.item_description, t.kategori
  ORDER BY revenue DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Discount overview by month
CREATE OR REPLACE FUNCTION get_discount_overview(
  p_year INT DEFAULT NULL,
  p_branch TEXT DEFAULT NULL
)
RETURNS TABLE(month INT, avg_disc_row NUMERIC, avg_disc_doc NUMERIC, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(MONTH FROM t.posting_date)::INT AS month,
    AVG(t.disc_per_row) AS avg_disc_row,
    AVG(t.disc_for_document) AS avg_disc_doc,
    SUM(t.new_row_total) AS revenue
  FROM transactions t
  WHERE
    t.posting_date IS NOT NULL
    AND (p_year IS NULL OR t.year = p_year)
    AND (p_branch IS NULL OR t.branch = p_branch)
  GROUP BY EXTRACT(MONTH FROM t.posting_date)
  ORDER BY month;
END;
$$ LANGUAGE plpgsql STABLE;

-- Customer summary
CREATE OR REPLACE FUNCTION get_customer_summary(
  p_year INT DEFAULT NULL
)
RETURNS TABLE(
  customer_code TEXT,
  customer_name TEXT,
  revenue NUMERIC,
  bills BIGINT,
  last_purchase TEXT,
  months_active BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.customer_code,
    MAX(t.customer_name) AS customer_name,
    SUM(t.new_row_total) AS revenue,
    COUNT(DISTINCT t.document_number) AS bills,
    MAX(t.posting_date)::TEXT AS last_purchase,
    COUNT(DISTINCT DATE_TRUNC('month', t.posting_date)) AS months_active
  FROM transactions t
  WHERE
    t.customer_code IS NOT NULL
    AND (p_year IS NULL OR t.year = p_year)
  GROUP BY t.customer_code
  ORDER BY revenue DESC;
END;
$$ LANGUAGE plpgsql STABLE;
