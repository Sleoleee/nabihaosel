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


@router.get("/kpi")
def kpi(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
        kategori: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    data = get_cache(db, f"kpi__{yk}")
    if not data:
        return {"revenue": 0, "bills": 0, "aov": 0, "customers": 0,
                "revenue_change": None, "bills_change": None, "aov_change": None, "customers_change": None}

    rev, bills, customers, aov = data["revenue"], data["bills"], data["customers"], data["aov"]

    prev_rev, prev_bills, prev_aov, prev_custs = 0, 0, 0, 0
    if yk != "all":
        prev = get_cache(db, f"kpi__{int(yk) - 1}") or {}
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
    }


@router.get("/revenue-trend")
def revenue_trend(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None),
                  branch: Optional[str] = Query(None)):
    db = get_client()
    data = get_cache(db, f"revenue_trend__{year_key(year)}")
    return data or {"data": [], "years": []}


@router.get("/bills-aov")
def bills_aov(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None),
              branch: Optional[str] = Query(None)):
    db = get_client()
    return get_cache(db, f"bills_aov__{year_key(year)}") or []


@router.get("/by-kategori")
def by_kategori(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
                branch: Optional[str] = Query(None)):
    db = get_client()
    return get_cache(db, f"by_kategori__{year_key(year)}") or []


@router.get("/by-branch")
def by_branch(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
              kategori: Optional[str] = Query(None)):
    db = get_client()
    return get_cache(db, f"by_branch__{year_key(year)}") or []


@router.get("/filters")
def get_filters():
    db = get_client()
    return get_cache(db, "filters") or {"years": [], "kategori": [], "branches": []}
