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


def safe_key(v):
    return v.replace("/", "_").replace(" ", "_") if v else v


def fsuffix(kategori=None, branch=None, spv=None, salesperson=None):
    """Suffix cache key untuk SATU irisan aktif (mutually exclusive di UI).
    Prioritas: salesperson > spv > kategori > branch."""
    if salesperson and salesperson != "all":
        return f"__sp__{safe_key(salesperson)}"
    if spv and spv != "all":
        return f"__spv__{safe_key(spv)}"
    if kategori and kategori != "all":
        return f"__kat__{safe_key(kategori)}"
    if branch and branch != "all":
        return f"__br__{safe_key(branch)}"
    return ""


def is_empty(data):
    if not data:
        return True
    return data.get("revenue", 0) == 0 and data.get("bills", 0) == 0


@router.get("/kpi")
def kpi(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
        kategori: Optional[str] = Query(None), branch: Optional[str] = Query(None),
        spv: Optional[str] = Query(None), salesperson: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    mk = month if (month and month != "all") else "all"
    suf = fsuffix(kategori, branch, spv, salesperson)

    # Build candidate keys: filter-specific first, then fall back to unfiltered
    candidates = []
    if suf:
        if mk != "all" and yk != "all":
            candidates.append((f"kpi__{yk}__{mk}{suf}", True))
        if yk != "all":
            candidates.append((f"kpi__{yk}{suf}", True))
        candidates.append((f"kpi__all{suf}", True))
    # Always add unfiltered fallback so we never return zeros just because filter cache missing
    if mk != "all" and yk != "all":
        candidates.append((f"kpi__{yk}__{mk}", not bool(suf)))
    if yk != "all":
        candidates.append((f"kpi__{yk}", not bool(suf)))
    candidates.append(("kpi__all", False))

    data = None
    cache_stale = False
    for key, is_specific in candidates:
        d = get_cache(db, key)
        if not is_empty(d):
            data = d
            cache_stale = not is_specific or (len(candidates) > 1 and key != candidates[0][0])
            break

    if not data:
        return {"revenue": 0, "bills": 0, "aov": 0, "customers": 0,
                "revenue_change": None, "bills_change": None,
                "aov_change": None, "customers_change": None, "cache_stale": True}

    rev, bills, customers, aov = data["revenue"], data["bills"], data["customers"], data["aov"]

    prev_rev, prev_bills, prev_aov, prev_custs = 0, 0, 0, 0
    if yk != "all":
        prev_yk = str(int(yk) - 1)
        if mk != "all":
            prev = (get_cache(db, f"kpi__{prev_yk}__{mk}{suf}") or
                    get_cache(db, f"kpi__{prev_yk}{suf}") or
                    get_cache(db, f"kpi__{prev_yk}__{mk}") or
                    get_cache(db, f"kpi__{prev_yk}") or {})
        else:
            prev = (get_cache(db, f"kpi__{prev_yk}{suf}") or
                    get_cache(db, f"kpi__{prev_yk}") or {})
        prev_rev   = prev.get("revenue", 0)
        prev_bills = prev.get("bills", 0)
        prev_custs = prev.get("customers", 0)
        prev_aov   = prev.get("aov", 0)

    def pct(a, b): return round((a - b) / b * 100, 1) if b else None

    return {
        "revenue": rev, "bills": bills, "aov": aov, "customers": customers,
        "revenue_change": pct(rev, prev_rev),
        "bills_change": pct(bills, prev_bills),
        "aov_change": pct(aov, prev_aov),
        "customers_change": pct(customers, prev_custs),
        "cache_stale": cache_stale,
    }


@router.get("/revenue-trend")
def revenue_trend(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None),
                  branch: Optional[str] = Query(None), spv: Optional[str] = Query(None),
                  salesperson: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    suf = fsuffix(kategori, branch, spv, salesperson)
    data = (
        (get_cache(db, f"revenue_trend__{yk}{suf}") if suf else None) or
        (get_cache(db, f"revenue_trend__all{suf}") if suf else None) or
        get_cache(db, f"revenue_trend__{yk}") or
        get_cache(db, "revenue_trend__all")
    )
    return data or {"data": [], "years": [], "primary": None}


@router.get("/bills-aov")
def bills_aov(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None),
              branch: Optional[str] = Query(None), spv: Optional[str] = Query(None),
              salesperson: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    suf = fsuffix(kategori, branch, spv, salesperson)
    return (
        (get_cache(db, f"bills_aov__{yk}{suf}") if suf else None) or
        (get_cache(db, f"bills_aov__all{suf}") if suf else None) or
        get_cache(db, f"bills_aov__{yk}") or
        get_cache(db, "bills_aov__all") or []
    )


@router.get("/category-pairings")
def category_pairings(year: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    return get_cache(db, f"pairings__{yk}") or get_cache(db, "pairings__all") or []


@router.get("/sales-targets")
def sales_targets(year: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    return (get_cache(db, f"sales_targets__{yk}") or get_cache(db, "sales_targets__all")
            or {"salespeople": [], "teams": []})


@router.get("/by-kategori")
def by_kategori(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
                branch: Optional[str] = Query(None), spv: Optional[str] = Query(None),
                salesperson: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    mk = month if (month and month != "all") else "all"
    suf = fsuffix(None, branch, spv, salesperson)
    candidates = []
    if suf:
        if mk != "all" and yk != "all":
            candidates.append(f"by_kategori__{yk}__{mk}{suf}")
        if yk != "all":
            candidates.append(f"by_kategori__{yk}{suf}")
        candidates.append(f"by_kategori__all{suf}")
    # Always include unfiltered fallback
    if mk != "all" and yk != "all":
        candidates.append(f"by_kategori__{yk}__{mk}")
    if yk != "all":
        candidates.append(f"by_kategori__{yk}")
    candidates.append("by_kategori__all")
    for key in candidates:
        data = get_cache(db, key)
        if data:
            return data
    return []


@router.get("/by-branch")
def by_branch(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
              kategori: Optional[str] = Query(None), spv: Optional[str] = Query(None),
              salesperson: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    mk = month if (month and month != "all") else "all"
    suf = fsuffix(kategori, None, spv, salesperson)
    candidates = []
    if suf:
        if mk != "all" and yk != "all":
            candidates.append(f"by_branch__{yk}__{mk}{suf}")
        if yk != "all":
            candidates.append(f"by_branch__{yk}{suf}")
        candidates.append(f"by_branch__all{suf}")
    # Always include unfiltered fallback
    if mk != "all" and yk != "all":
        candidates.append(f"by_branch__{yk}__{mk}")
    if yk != "all":
        candidates.append(f"by_branch__{yk}")
    candidates.append("by_branch__all")
    for key in candidates:
        data = get_cache(db, key)
        if data:
            return data
    return []


@router.get("/alerts")
def alerts(year: Optional[str] = Query(None)):
    db = get_client()
    yk = year_key(year)
    return (get_cache(db, f"alerts__{yk}") or get_cache(db, "alerts__all") or
            {"at_risk_count": 0, "at_risk_revenue": 0, "lapsed_count": 0, "lapsed_revenue": 0})


@router.get("/filters")
def get_filters():
    db = get_client()
    return get_cache(db, "filters") or {"years": [], "kategori": [], "branches": []}
