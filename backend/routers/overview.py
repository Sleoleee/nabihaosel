from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


def _int(val):
    return int(val) if val and val != "all" else None


def _str(val):
    return val if val and val != "all" else None


@router.get("/kpi")
def kpi(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
        kategori: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    params = {"p_year": _int(year), "p_month": _int(month), "p_kategori": _str(kategori), "p_branch": _str(branch)}
    cur = db.rpc("get_kpi", params).execute().data
    prev = []
    if _int(year):
        prev = db.rpc("get_kpi", {**params, "p_year": _int(year) - 1}).execute().data

    def metrics(d):
        if not d: return 0, 0, 0, 0
        r = d[0]
        rev = float(r.get("revenue") or 0)
        bills = int(r.get("bills") or 0)
        custs = int(r.get("customers") or 0)
        return rev, bills, rev/bills if bills else 0, custs

    def pct(a, b): return round((a-b)/b*100, 1) if b else None

    rev, bills, aov, custs = metrics(cur)
    prev_rev, prev_bills, prev_aov, prev_custs = metrics(prev)
    return {"revenue": rev, "bills": bills, "aov": aov, "customers": custs,
            "revenue_change": pct(rev, prev_rev), "bills_change": pct(bills, prev_bills),
            "aov_change": pct(aov, prev_aov), "customers_change": pct(custs, prev_custs)}


@router.get("/revenue-trend")
def revenue_trend(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    rows = db.rpc("get_revenue_trend", {"p_year": _int(year), "p_kategori": _str(kategori), "p_branch": _str(branch)}).execute().data

    grouped = defaultdict(lambda: defaultdict(float))
    years_set = set()
    for r in rows:
        y, m = r["year"], r["month"]
        years_set.add(y)
        grouped[y][m] = float(r["revenue"] or 0)

    result = []
    for m_idx in range(1, 13):
        entry = {"month": MONTHS[m_idx-1], "month_num": m_idx}
        for y in sorted(years_set):
            entry[str(y)] = round(grouped[y].get(m_idx, 0))
        result.append(entry)
    return {"data": result, "years": sorted(years_set)}


@router.get("/bills-aov")
def bills_aov(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    rows = db.rpc("get_bills_aov", {"p_year": _int(year), "p_kategori": _str(kategori), "p_branch": _str(branch)}).execute().data
    monthly = {r["month"]: r for r in rows}
    result = []
    for m in range(1, 13):
        r = monthly.get(m, {})
        bills = int(r.get("bills") or 0)
        rev = float(r.get("revenue") or 0)
        result.append({"month": MONTHS[m-1], "bills": bills, "aov": round(rev/bills) if bills else 0})
    return result


@router.get("/by-kategori")
def by_kategori(year: Optional[str] = Query(None), month: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    rows = db.rpc("get_revenue_by_kategori", {"p_year": _int(year), "p_month": _int(month), "p_branch": _str(branch)}).execute().data
    return [{"kategori": r["kategori"], "revenue": round(float(r["revenue"] or 0))} for r in rows]


@router.get("/by-branch")
def by_branch(year: Optional[str] = Query(None), month: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    rows = db.rpc("get_revenue_by_branch", {"p_year": _int(year), "p_month": _int(month), "p_kategori": _str(kategori)}).execute().data
    return [{"branch": r["branch"], "revenue": round(float(r["revenue"] or 0))} for r in rows]


@router.get("/filters")
def get_filters():
    db = get_client()
    rows = db.rpc("get_filters", {}).execute().data
    if not rows:
        return {"years": [], "kategori": [], "branches": []}
    r = rows[0]
    return {"years": r.get("years") or [], "kategori": r.get("kategori") or [], "branches": r.get("branches") or []}
