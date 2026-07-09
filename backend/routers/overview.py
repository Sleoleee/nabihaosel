from fastapi import APIRouter, Query
from typing import Optional
from utils.db import get_client

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


def _int(val):
    return int(val) if val and val != "all" else None


@router.get("/kpi")
def kpi(
    year: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    branch: Optional[str] = Query(None),
):
    db = get_client()
    y = _int(year)
    m = _int(month)

    params = {
        "p_year": y,
        "p_month": m,
        "p_kategori": kategori if kategori and kategori != "all" else None,
        "p_branch": branch if branch and branch != "all" else None,
    }
    cur = db.rpc("get_kpi", params).execute().data
    prev = []
    if y:
        prev_params = {**params, "p_year": y - 1}
        prev = db.rpc("get_kpi", prev_params).execute().data

    def row(data):
        if not data:
            return 0, 0, 0
        r = data[0]
        rev = float(r.get("revenue") or 0)
        bills = int(r.get("bills") or 0)
        custs = int(r.get("customers") or 0)
        aov = rev / bills if bills > 0 else 0
        return rev, bills, aov, custs

    def pct(a, b):
        if b == 0:
            return None
        return round((a - b) / b * 100, 1)

    rev, bills, aov, custs = row(cur)
    prev_rev, prev_bills, prev_aov, prev_custs = row(prev) if prev else (0, 0, 0, 0)

    return {
        "revenue": rev,
        "bills": bills,
        "aov": aov,
        "customers": custs,
        "revenue_change": pct(rev, prev_rev),
        "bills_change": pct(bills, prev_bills),
        "aov_change": pct(aov, prev_aov),
        "customers_change": pct(custs, prev_custs),
    }


@router.get("/revenue-trend")
def revenue_trend(
    year: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    branch: Optional[str] = Query(None),
):
    db = get_client()
    params = {
        "p_year": _int(year),
        "p_kategori": kategori if kategori and kategori != "all" else None,
        "p_branch": branch if branch and branch != "all" else None,
    }
    rows = db.rpc("get_revenue_trend", params).execute().data

    from collections import defaultdict
    grouped = defaultdict(lambda: defaultdict(float))
    years_set = set()
    for r in rows:
        y = r["year"]
        m = r["month"]
        years_set.add(y)
        grouped[y][m] = float(r["revenue"] or 0)

    result = []
    for m_idx in range(1, 13):
        entry = {"month": MONTHS[m_idx - 1], "month_num": m_idx}
        for y in sorted(years_set):
            entry[str(y)] = round(grouped[y].get(m_idx, 0))
        result.append(entry)

    return {"data": result, "years": sorted(years_set)}


@router.get("/bills-aov")
def bills_aov(
    year: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    branch: Optional[str] = Query(None),
):
    db = get_client()
    params = {
        "p_year": _int(year),
        "p_kategori": kategori if kategori and kategori != "all" else None,
        "p_branch": branch if branch and branch != "all" else None,
    }
    rows = db.rpc("get_bills_aov", params).execute().data

    monthly = {r["month"]: r for r in rows}
    result = []
    for m_idx in range(1, 13):
        r = monthly.get(m_idx, {})
        bills = int(r.get("bills") or 0)
        rev = float(r.get("revenue") or 0)
        result.append({
            "month": MONTHS[m_idx - 1],
            "bills": bills,
            "aov": round(rev / bills) if bills > 0 else 0,
        })
    return result


@router.get("/by-kategori")
def by_kategori(
    year: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    branch: Optional[str] = Query(None),
):
    db = get_client()
    params = {
        "p_year": _int(year),
        "p_month": _int(month),
        "p_branch": branch if branch and branch != "all" else None,
    }
    rows = db.rpc("get_revenue_by_kategori", params).execute().data
    return [{"kategori": r["kategori"], "revenue": round(float(r["revenue"] or 0))} for r in rows]


@router.get("/by-branch")
def by_branch(
    year: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
):
    db = get_client()
    params = {
        "p_year": _int(year),
        "p_month": _int(month),
        "p_kategori": kategori if kategori and kategori != "all" else None,
    }
    rows = db.rpc("get_revenue_by_branch", params).execute().data
    return [{"branch": r["branch"], "revenue": round(float(r["revenue"] or 0))} for r in rows]


@router.get("/filters")
def get_filters():
    db = get_client()
    rows = db.rpc("get_filters", {}).execute().data
    if not rows:
        return {"years": [], "kategori": [], "branches": []}
    r = rows[0]
    return {
        "years": r.get("years") or [],
        "kategori": r.get("kategori") or [],
        "branches": r.get("branches") or [],
    }
