from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]
ROW_LIMIT = 300000


def _int(val):
    return int(val) if val and val != "all" else None


def fetch(db, cols, year=None, month=None, kategori=None, branch=None):
    q = db.table("transactions").select(cols)
    if year and year != "all":
        q = q.eq("year", int(year))
    data = q.order("posting_date").limit(ROW_LIMIT).execute().data
    if month and month != "all":
        data = [r for r in data if r.get("posting_date") and int(r["posting_date"][5:7]) == int(month)]
    if kategori and kategori != "all":
        data = [r for r in data if r.get("kategori") == kategori]
    if branch and branch != "all":
        data = [r for r in data if r.get("branch") == branch]
    return data


@router.get("/kpi")
def kpi(year: Optional[str] = Query(None), month: Optional[str] = Query(None),
        kategori: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    data = fetch(db, "new_row_total,document_number,customer_code,posting_date,kategori,branch", year, month, kategori, branch)
    yoy = []
    if year and year != "all":
        yoy = fetch(db, "new_row_total,document_number,customer_code,posting_date,kategori,branch", str(int(year)-1), month, kategori, branch)

    def metrics(d):
        rev = sum(r.get("new_row_total") or 0 for r in d)
        bills = len(set(r.get("document_number") for r in d if r.get("document_number")))
        custs = len(set(r.get("customer_code") for r in d if r.get("customer_code")))
        return rev, bills, rev/bills if bills else 0, custs

    def pct(a, b): return round((a-b)/b*100, 1) if b else None

    rev, bills, aov, custs = metrics(data)
    prev_rev, prev_bills, prev_aov, prev_custs = metrics(yoy) if yoy else (0,0,0,0)
    return {"revenue": rev, "bills": bills, "aov": aov, "customers": custs,
            "revenue_change": pct(rev, prev_rev), "bills_change": pct(bills, prev_bills),
            "aov_change": pct(aov, prev_aov), "customers_change": pct(custs, prev_custs)}


@router.get("/revenue-trend")
def revenue_trend(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    q = db.table("transactions").select("new_row_total,posting_date,year,kategori,branch")
    data = q.order("posting_date").limit(ROW_LIMIT).execute().data
    if kategori and kategori != "all":
        data = [r for r in data if r.get("kategori") == kategori]
    if branch and branch != "all":
        data = [r for r in data if r.get("branch") == branch]

    grouped = defaultdict(lambda: defaultdict(float))
    years_set = set(r["year"] for r in data if r.get("year"))
    if year and year != "all":
        years_set = {int(year)}

    for r in data:
        y = r.get("year")
        if not y or y not in years_set: continue
        pd_str = r.get("posting_date")
        if not pd_str: continue
        grouped[y][int(pd_str[5:7])] += r.get("new_row_total") or 0

    result = []
    for m in range(1, 13):
        entry = {"month": MONTHS[m-1], "month_num": m}
        for y in sorted(years_set):
            entry[str(y)] = round(grouped[y].get(m, 0))
        result.append(entry)
    return {"data": result, "years": sorted(years_set)}


@router.get("/bills-aov")
def bills_aov(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    data = fetch(db, "new_row_total,document_number,posting_date,kategori,branch", year, None, kategori, branch)
    monthly_bills = defaultdict(set)
    monthly_rev = defaultdict(float)
    for r in data:
        pd_str = r.get("posting_date")
        if not pd_str: continue
        m = int(pd_str[5:7])
        if r.get("document_number"): monthly_bills[m].add(r["document_number"])
        monthly_rev[m] += r.get("new_row_total") or 0
    return [{"month": MONTHS[m-1], "bills": len(monthly_bills[m]), "aov": round(monthly_rev[m]/len(monthly_bills[m])) if monthly_bills[m] else 0} for m in range(1, 13)]


@router.get("/by-kategori")
def by_kategori(year: Optional[str] = Query(None), month: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    data = fetch(db, "new_row_total,kategori,posting_date,branch", year, month, None, branch)
    grouped = defaultdict(float)
    for r in data:
        grouped[r.get("kategori") or "Lainnya"] += r.get("new_row_total") or 0
    return sorted([{"kategori": k, "revenue": round(v)} for k, v in grouped.items()], key=lambda x: -x["revenue"])


@router.get("/by-branch")
def by_branch(year: Optional[str] = Query(None), month: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    data = fetch(db, "new_row_total,branch,posting_date,kategori", year, month, kategori, None)
    grouped = defaultdict(float)
    for r in data:
        grouped[r.get("branch") or "Lainnya"] += r.get("new_row_total") or 0
    return sorted([{"branch": b, "revenue": round(v)} for b, v in grouped.items()], key=lambda x: -x["revenue"])


@router.get("/filters")
def get_filters():
    db = get_client()
    data = db.table("transactions").select("year,kategori,branch").order("posting_date").limit(ROW_LIMIT).execute().data
    years = sorted(set(r["year"] for r in data if r.get("year")), reverse=True)
    kategori = sorted(set(r["kategori"] for r in data if r.get("kategori")))
    branches = sorted(set(r["branch"] for r in data if r.get("branch")))
    return {"years": years, "kategori": kategori, "branches": branches}
