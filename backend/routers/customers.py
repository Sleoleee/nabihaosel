from fastapi import APIRouter, Query
from typing import Optional
from utils.db import get_client

router = APIRouter()


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
