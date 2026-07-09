from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]
ROW_LIMIT = 300000


def _int(val):
    return int(val) if val and val != "all" else None


def fetch(db, cols, year=None, kategori=None, branch=None):
    q = db.table("transactions").select(cols)
    if year and year != "all": q = q.eq("year", int(year))
    if kategori and kategori != "all": q = q.eq("kategori", kategori)
    if branch and branch != "all": q = q.eq("branch", branch)
    return q.order("posting_date").limit(ROW_LIMIT).execute().data


@router.get("/kategori-trend")
def kategori_trend(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    data = db.table("transactions").select("new_row_total,kategori,year").order("posting_date").limit(ROW_LIMIT).execute().data
    if kategori and kategori != "all":
        selected = {k.strip() for k in kategori.split(",")}
        data = [r for r in data if r.get("kategori") in selected]
    grouped = defaultdict(lambda: defaultdict(float))
    all_years, all_cats = set(), set()
    for r in data:
        y, k = r.get("year"), r.get("kategori") or "Lainnya"
        if y:
            grouped[y][k] += r.get("new_row_total") or 0
            all_years.add(y); all_cats.add(k)
    result = [{"year": y, **{k: round(grouped[y].get(k, 0)) for k in all_cats}} for y in sorted(all_years)]
    cat_totals = {k: sum(grouped[y].get(k, 0) for y in all_years) for k in all_cats}
    return {"data": result, "categories": sorted(all_cats), "top5": sorted(cat_totals, key=lambda x: -cat_totals[x])[:5]}


@router.get("/kategori-growth")
def kategori_growth(year: Optional[str] = Query(None)):
    db = get_client()
    data = db.table("transactions").select("new_row_total,kategori,year").order("posting_date").limit(ROW_LIMIT).execute().data
    grouped = defaultdict(lambda: defaultdict(float))
    all_years = sorted(set(r["year"] for r in data if r.get("year")))
    for r in data:
        grouped[r.get("kategori") or "Lainnya"][r.get("year")] += r.get("new_row_total") or 0
    compare_year = _int(year) or (all_years[-1] if all_years else None)
    if not compare_year: return []
    idx = all_years.index(compare_year) if compare_year in all_years else -1
    prev_year = all_years[idx-1] if idx > 0 else None
    result = []
    for k, yrs in grouped.items():
        curr, prev = yrs.get(compare_year, 0), yrs.get(prev_year, 0) if prev_year else 0
        result.append({"kategori": k, "current": round(curr), "prev": round(prev),
                       "growth": round((curr-prev)/prev*100, 1) if prev else None})
    result.sort(key=lambda x: (x["growth"] is None, -(x["growth"] or 0)))
    return result


@router.get("/top-products")
def top_products(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    data = fetch(db, "new_row_total,item_no,item_description,kategori,quantity", year, kategori)
    grouped = defaultdict(lambda: {"description": "", "kategori": "", "revenue": 0, "qty": 0})
    for r in data:
        sku = r.get("item_no") or "UNKNOWN"
        grouped[sku]["description"] = r.get("item_description") or sku
        grouped[sku]["kategori"] = r.get("kategori") or ""
        grouped[sku]["revenue"] += r.get("new_row_total") or 0
        grouped[sku]["qty"] += r.get("quantity") or 0
    return sorted([{"item_no": k, "description": v["description"], "kategori": v["kategori"],
                    "revenue": round(v["revenue"]), "qty": int(v["qty"])} for k, v in grouped.items()],
                  key=lambda x: -x["revenue"])[:20]


@router.get("/heatmap")
def heatmap(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    data = fetch(db, "new_row_total,kategori,posting_date", year, kategori)
    grouped = defaultdict(lambda: defaultdict(float))
    all_cats = set()
    for r in data:
        k, pd_str = r.get("kategori") or "Lainnya", r.get("posting_date")
        if not pd_str: continue
        grouped[k][int(pd_str[5:7])] += r.get("new_row_total") or 0
        all_cats.add(k)
    return [{"kategori": k, **{MONTHS[m-1]: round(grouped[k].get(m, 0)) for m in range(1, 13)}} for k in sorted(all_cats)]
