"""
Penyimpanan data mentah LOKAL (SQLite) — menggantikan tabel transactions di Supabase.
Supabase kini hanya menyimpan agregat; data mentah besar tinggal di sini.

Lokasi default: <repo>/data_local/transactions.db  (override via env LOCAL_DB_PATH).
"""
import os
import sqlite3

_HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT = os.path.join(os.path.dirname(_HERE), "data_local", "transactions.db")

COLUMNS = [
    "document_number", "posting_date", "due_date", "customer_code", "customer_name",
    "item_no", "item_description", "kategori", "warehouse_code", "quantity", "unit",
    "harga_awal", "disc_per_row", "harga_jual", "row_total", "disc_for_document",
    "new_row_total", "slp_name", "branch", "status_payment", "year",
]


def db_path():
    return os.getenv("LOCAL_DB_PATH", _DEFAULT)


def connect():
    p = db_path()
    os.makedirs(os.path.dirname(p), exist_ok=True)
    conn = sqlite3.connect(p)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_schema(conn):
    cols = ", ".join(f'"{c}" TEXT' for c in COLUMNS)
    conn.execute(f'CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, {cols})')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_tx_year ON transactions(year)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_tx_branch ON transactions(branch)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(posting_date)')
    conn.commit()


def insert_rows(conn, rows):
    if not rows:
        return 0
    ph = ", ".join("?" for _ in COLUMNS)
    cols = ", ".join(f'"{c}"' for c in COLUMNS)
    data = [[r.get(c) for c in COLUMNS] for r in rows]
    conn.executemany(f'INSERT INTO transactions ({cols}) VALUES ({ph})', data)
    conn.commit()
    return len(data)


def count(conn, where="", params=()):
    q = "SELECT COUNT(*) FROM transactions" + (f" WHERE {where}" if where else "")
    return conn.execute(q, params).fetchone()[0]


def iter_rows(conn, cols=None, where="", params=(), batch=50000):
    """Yield baris sebagai dict, streaming per batch (hemat memori)."""
    sel = ", ".join(f'"{c}"' for c in (cols or COLUMNS))
    q = f"SELECT {sel} FROM transactions" + (f" WHERE {where}" if where else "")
    cur = conn.execute(q, params)
    names = [d[0] for d in cur.description]
    while True:
        chunk = cur.fetchmany(batch)
        if not chunk:
            break
        for row in chunk:
            yield dict(zip(names, row))


def channel_where(channel):
    """(where, params) untuk memfilter channel via pola branch (config). None bila tak bisa."""
    import config
    pats = config.channel_branch_patterns(channel)
    if pats is None:
        return None
    clause = " OR ".join("upper(branch) LIKE ?" for _ in pats)
    return f"({clause})", [f"%{p}%" for p in pats]
