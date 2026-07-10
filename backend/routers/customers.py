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


@router.get("/rfm")
def rfm(year: Optional[str] = Query(None)):
    db = get_client()
    return get_cache(db, f"rfm__{year_key(year)}") or {"matrix": [], "segments": []}


@router.get("/tiers")
def tiers(year: Optional[str] = Query(None)):
    db = get_client()
    return get_cache(db, f"tiers__{year_key(year)}") or []


@router.get("/list")
def customer_list(year: Optional[str] = Query(None), tier: Optional[str] = Query(None),
                  segment: Optional[str] = Query(None), search: Optional[str] = Query(None),
                  sort: Optional[str] = Query("revenue"),
                  page: int = Query(1), limit: int = Query(25)):
    db = get_client()
    rows = get_cache(db, f"customers__{year_key(year)}") or []

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
    return get_cache(db, f"recency__{year_key(year)}") or []
