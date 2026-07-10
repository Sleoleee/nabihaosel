from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


def _p(year=None, month=None, kategori=None, branch=None):
    p = {}
    if year and year != "all": p["p_year"] = int(year)
    if month and month != "all": p["p_month"] = int(month)
    if kategori and kategori != "all": p["p_kategori"] = kategori
    if branch and branch != "all": p["p_branch"] = branch
    return p


@router.get("/kpi")
def kpi(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
        kategori: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    params = _p(year, month, kategori, branch)
    rows = db.rpc("get_kpi", params).execute().data
    row = rows[0] if rows else {}
    rev = float(row.get("revenue") or 0)
    bills = int(row.get("bills") or 0)
    customers = int(row.get("customers") or 0)
    aov = rev / bills if bills else 0

    prev_rev, prev_bills, prev_aov, prev_custs = 0, 0, 0, 0
    if year and year != "all":
        prev_params = _p(str(int(year) - 1), month, kategori, branch)
        prev_rows = db.rpc("get_kpi", prev_params).execute().data
        prev = prev_rows[0] if prev_rows else {}
        prev_rev = float(prev.get("revenue") or 0)
        prev_bills = int(prev.get("bills") or 0)
        prev_custs = int(prev.get("customers") or 0)
        prev_aov = prev_rev / prev_bills if prev_bills else 0

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
    params = _p(year, None, kategori, branch)
    rows = db.rpc("get_revenue_trend", params).execute().data

    grouped = defaultdict(lambda: defaultdict(float))
    years_set = set()
    for r in rows:
        y, m = r.get("year"), r.get("month")
        if y and m:
            grouped[y][m] += float(r.get("revenue") or 0)
            years_set.add(y)

    if year and year != "all":
        years_set = {int(year)}

    result = []
    for m in range(1, 13):
        entry = {"month": MONTHS[m - 1], "month_num": m}
        for y in sorted(years_set):
            entry[str(y)] = round(grouped[y].get(m, 0))
        result.append(entry)
    return {"data": result, "years": sorted(years_set)}


@router.get("/bills-aov")
def bills_aov(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None),
              branch: Optional[str] = Query(None)):
    db = get_client()
    params = _p(year, None, kategori, branch)
    rows = db.rpc("get_bills_aov", params).execute().data
    monthly = {r["month"]: r for r in rows if r.get("month")}
    return [{"month": MONTHS[m - 1],
             "bills": int(monthly.get(m, {}).get("bills") or 0),
             "aov": round(float(monthly.get(m, {}).get("revenue") or 0) / max(1, int(monthly.get(m, {}).get("bills") or 1)))
             } for m in range(1, 13)]


@router.get("/by-kategori")
def by_kategori(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
                branch: Optional[str] = Query(None)):
    db = get_client()
    params = _p(year, month, None, branch)
    rows = db.rpc("get_revenue_by_kategori", params).execute().data
    return [{"kategori": r["kategori"], "revenue": round(float(r["revenue"] or 0))} for r in rows]


@router.get("/by-branch")
def by_branch(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
              kategori: Optional[str] = Query(None)):
    db = get_client()
    params = _p(year, month, kategori, None)
    rows = db.rpc("get_revenue_by_branch", params).execute().data
    return [{"branch": r["branch"], "revenue": round(float(r["revenue"] or 0))} for r in rows]


@router.get("/filters")
def get_filters():
    db = get_client()
    result = db.rpc("get_filters", {}).execute().data
    if isinstance(result, list) and result:
        data = result[0]
    else:
        data = result or {}
    return {
        "years": data.get("years") or [],
        "kategori": data.get("kategori") or [],
        "branches": data.get("branches") or [],
    }
