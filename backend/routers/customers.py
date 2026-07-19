from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client

router = APIRouter()

# Pelanggan dianggap "jatuh tempo beli ulang" bila sudah melewati jeda beli normalnya
OVERDUE_THRESHOLD = 1.0


def get_cache(db, key):
    r = db.table("dashboard_cache").select("payload").eq("cache_key", key).limit(1).execute()
    if r.data:
        return r.data[0]["payload"]
    return None


def year_key(year):
    return year if (year and year != "all") else "all"


def load_customers(db, yk):
    rows = get_cache(db, f"customers__{yk}") or []
    if not rows:
        rows = get_cache(db, "customers__all") or []
        return rows
    # Fall back if rfm_segment is missing on all rows (stale cache)
    has_rfm = any(r.get("rfm_segment") for r in rows[:20])
    if not has_rfm:
        fallback = get_cache(db, "customers__all") or []
        if fallback and any(r.get("rfm_segment") for r in fallback[:20]):
            return fallback
    return rows


def filter_customers(rows, tier=None, segment=None):
    if tier and tier != "all":
        rows = [r for r in rows if r.get("tier") == tier]
    if segment and segment != "all":
        rows = [r for r in rows if r.get("rfm_segment") == segment]
    return rows


def summarize(custs):
    """Agregat KPI untuk sekumpulan pelanggan (sudah tersaring)."""
    n = len(custs)
    total_rev = sum(c.get("revenue", 0) for c in custs)
    avg_rev = total_rev / n if n else 0

    # Average retention days: rata-rata jeda beli (hari) untuk yang punya interval
    ret_days = [c["avg_interval_hours"] / 24.0 for c in custs if c.get("avg_interval_hours")]
    avg_ret_days = sum(ret_days) / len(ret_days) if ret_days else 0

    # Jatuh tempo: pelanggan dengan overdue_ratio >= threshold (lewat jeda beli normal)
    with_ratio = [c for c in custs if c.get("overdue_ratio") is not None]
    overdue = [c for c in with_ratio if c["overdue_ratio"] >= OVERDUE_THRESHOLD]
    overdue_rate = len(overdue) / len(with_ratio) * 100 if with_ratio else 0

    # Revenue at risk: jumlah nilai belanja rata-rata per siklus (revenue/bills) pelanggan jatuh tempo
    rev_at_risk = sum((c["revenue"] / c["bills"]) for c in overdue if c.get("bills"))
    pct_rev_at_risk = rev_at_risk / total_rev * 100 if total_rev else 0

    return {
        "total_customers": n,
        "avg_rev_per_customer": round(avg_rev),
        "avg_retention_days": round(avg_ret_days, 1),
        "revenue_at_risk": round(rev_at_risk),
        "overdue_rate": round(overdue_rate, 1),
        "overdue_count": len(overdue),
        "due_denominator": len(with_ratio),
        "pct_revenue_at_risk": round(pct_rev_at_risk, 1),
        "retention_rate": round(100 - overdue_rate, 1),
        "total_revenue": round(total_rev),
    }


def pct_change(cur, prev):
    return round((cur - prev) / prev * 100, 1) if prev else None


@router.get("/summary")
def summary(year: Optional[str] = Query(None), tier: Optional[str] = Query(None),
            segment: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    cur = summarize(filter_customers(load_customers(db, yk), tier, segment))

    # Pembanding tahun sebelumnya (filter sama) untuk KPI 1-3
    changes = {"total_customers": None, "avg_rev_per_customer": None, "avg_retention_days": None}
    if yk != "all":
        prev_yk = str(int(yk) - 1)
        prev_rows = get_cache(db, f"customers__{prev_yk}")
        if prev_rows:
            prev = summarize(filter_customers(prev_rows, tier, segment))
            changes["total_customers"] = pct_change(cur["total_customers"], prev["total_customers"])
            changes["avg_rev_per_customer"] = pct_change(cur["avg_rev_per_customer"], prev["avg_rev_per_customer"])
            changes["avg_retention_days"] = pct_change(cur["avg_retention_days"], prev["avg_retention_days"])
    cur["changes"] = changes
    return cur


@router.get("/rfm-bubble")
def rfm_bubble(year: Optional[str] = Query(None)):
    """Data bubble RFM per segmen: Recency (x) × Frequency (y), ukuran = jumlah customer."""
    db = get_client()
    custs = load_customers(db, year_key(year))
    seg = defaultdict(lambda: {"count": 0, "revenue": 0.0, "rec": 0.0, "freq": 0.0})
    for c in custs:
        s = c.get("rfm_segment")
        if not s:
            continue
        seg[s]["count"] += 1
        seg[s]["revenue"] += c.get("revenue", 0)
        seg[s]["rec"] += c.get("days_since_purchase", 0)
        seg[s]["freq"] += c.get("bills", 0)
    out = []
    for s, v in seg.items():
        n = v["count"] or 1
        out.append({
            "segment": s,
            "count": v["count"],
            "revenue": round(v["revenue"]),
            "avg_recency_days": round(v["rec"] / n),
            "avg_frequency": round(v["freq"] / n, 1),
        })
    return out


@router.get("/rfm")
def rfm(year: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    data = get_cache(db, f"rfm__{yk}")
    if not data or not data.get("segments"):
        data = get_cache(db, "rfm__all")
    return data or {"matrix": [], "segments": []}


@router.get("/tiers")
def tiers(year: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    data = get_cache(db, f"tiers__{yk}")
    if not data:
        data = get_cache(db, "tiers__all")
    return data or []


@router.get("/list")
def customer_list(year: Optional[str] = Query(None), tier: Optional[str] = Query(None),
                  segment: Optional[str] = Query(None), search: Optional[str] = Query(None),
                  sort: Optional[str] = Query("revenue"),
                  page: int = Query(1), limit: int = Query(25)):
    db = get_client()
    rows = load_customers(db, year_key(year))

    if search:
        rows = [r for r in rows if search.lower() in r["name"].lower()]
    if tier:
        rows = [r for r in rows if r.get("tier") == tier]
    if segment:
        rows = [r for r in rows if r.get("rfm_segment") == segment]

    def sort_val(x):
        if sort == "overdue_ratio":
            v = x.get("overdue_ratio")
            return -(v if v is not None else -1)
        return -x.get(sort, 0)

    rows = sorted(rows, key=sort_val)

    total = len(rows)
    start = (page - 1) * limit
    return {"data": rows[start:start + limit], "total": total, "page": page, "limit": limit}


@router.get("/recency")
def recency(year: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    data = get_cache(db, f"recency__{yk}")
    if not data:
        data = get_cache(db, "recency__all")
    return data or []
