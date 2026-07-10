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


def get_cache_with_fallback(db, key, fallback_key):
    data = get_cache(db, key)
    # Fall back if missing or clearly empty (revenue=0 AND bills=0 = stale/broken cache)
    if not data or (data.get("revenue", 0) == 0 and data.get("bills", 0) == 0 and key != fallback_key):
        fb = get_cache(db, fallback_key)
        if fb and (fb.get("revenue", 0) > 0 or fb.get("bills", 0) > 0):
            return fb, True  # (data, used_fallback)
    return data, False


@router.get("/kpi")
def kpi(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
        kategori: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    mk = month if (month and month != "all") else "all"

    if mk != "all":
        key = f"kpi__{yk}__{mk}"
        prev_key = f"kpi__{yk}__{int(mk) - 1}" if int(mk) > 1 else None
        fallback_key = f"kpi__all__{mk}"
    else:
        key = f"kpi__{yk}"
        prev_key = f"kpi__{int(yk) - 1}" if yk != "all" else None
        fallback_key = "kpi__all"

    data, used_fallback = get_cache_with_fallback(db, key, fallback_key)
    if not data:
        return {"revenue": 0, "bills": 0, "aov": 0, "customers": 0,
                "revenue_change": None, "bills_change": None, "aov_change": None, "customers_change": None,
                "cache_stale": True}

    rev, bills, customers, aov = data["revenue"], data["bills"], data["customers"], data["aov"]

    prev_rev, prev_bills, prev_aov, prev_custs = 0, 0, 0, 0
    if prev_key and not used_fallback:
        prev = get_cache(db, prev_key) or {}
        prev_rev = prev.get("revenue", 0)
        prev_bills = prev.get("bills", 0)
        prev_custs = prev.get("customers", 0)
        prev_aov = prev.get("aov", 0)

    def pct(a, b): return round((a - b) / b * 100, 1) if b else None

    return {
        "revenue": rev, "bills": bills, "aov": aov, "customers": customers,
        "revenue_change": pct(rev, prev_rev),
        "bills_change": pct(bills, prev_bills),
        "aov_change": pct(aov, prev_aov),
        "customers_change": pct(customers, prev_custs),
        "cache_stale": used_fallback,
    }


@router.get("/revenue-trend")
def revenue_trend(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None),
                  branch: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    data = get_cache(db, f"revenue_trend__{yk}")
    if not data or not data.get("data"):
        data = get_cache(db, "revenue_trend__all")
    return data or {"data": [], "years": []}


@router.get("/bills-aov")
def bills_aov(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None),
              branch: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    data = get_cache(db, f"bills_aov__{yk}")
    if not data:
        data = get_cache(db, "bills_aov__all")
    return data or []


@router.get("/by-kategori")
def by_kategori(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
                branch: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    mk = month if (month and month != "all") else "all"
    key = f"by_kategori__{yk}__{mk}" if mk != "all" else f"by_kategori__{yk}"
    data = get_cache(db, key)
    if not data:
        data = get_cache(db, "by_kategori__all")
    return data or []


@router.get("/by-branch")
def by_branch(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
              kategori: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    mk = month if (month and month != "all") else "all"
    key = f"by_branch__{yk}__{mk}" if mk != "all" else f"by_branch__{yk}"
    data = get_cache(db, key)
    if not data:
        data = get_cache(db, "by_branch__all")
    return data or []


@router.get("/alerts")
def alerts(year: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    data = get_cache(db, f"alerts__{yk}")
    if not data:
        data = get_cache(db, "alerts__all")
    return data or {
        "at_risk_count": 0, "at_risk_revenue": 0, "lapsed_count": 0, "lapsed_revenue": 0
    }


@router.get("/filters")
def get_filters():
    db = get_client()
    return get_cache(db, "filters") or {"years": [], "kategori": [], "branches": []}
