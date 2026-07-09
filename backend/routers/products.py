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


@router.get("/kategori-trend")
def kategori_trend(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    filter_data = db.rpc("get_filters", {}).execute().data
    all_years = sorted(filter_data[0].get("years", [])) if filter_data else []

    result_grouped = defaultdict(lambda: defaultdict(float))
    all_cats = set()
    for y in all_years:
        rows = db.rpc("get_revenue_by_kategori", {"p_year": y, "p_month": None, "p_branch": None}).execute().data
        for r in rows:
            k = r["kategori"]
            if kategori and kategori != "all" and k not in {kk.strip() for kk in kategori.split(",")}:
                continue
            result_grouped[y][k] = float(r["revenue"] or 0)
            all_cats.add(k)

    result = [{"year": y, **{k: round(result_grouped[y].get(k, 0)) for k in all_cats}} for y in sorted(all_years)]
    cat_totals = {k: sum(result_grouped[y].get(k, 0) for y in all_years) for k in all_cats}
    top5 = sorted(cat_totals, key=lambda x: -cat_totals[x])[:5]
    return {"data": result, "categories": sorted(all_cats), "top5": top5}


@router.get("/kategori-growth")
def kategori_growth(year: Optional[str] = Query(None)):
    db = get_client()
    filter_data = db.rpc("get_filters", {}).execute().data
    all_years = sorted(filter_data[0].get("years", [])) if filter_data else []

    compare_year = _int(year) or (all_years[-1] if all_years else None)
    if not compare_year: return []
    idx = all_years.index(compare_year) if compare_year in all_years else -1
    prev_year = all_years[idx-1] if idx > 0 else None

    curr_map = {r["kategori"]: float(r["revenue"] or 0) for r in db.rpc("get_revenue_by_kategori", {"p_year": compare_year, "p_month": None, "p_branch": None}).execute().data}
    prev_map = {r["kategori"]: float(r["revenue"] or 0) for r in db.rpc("get_revenue_by_kategori", {"p_year": prev_year, "p_month": None, "p_branch": None}).execute().data} if prev_year else {}

    result = []
    for k in set(curr_map) | set(prev_map):
        curr, prev = curr_map.get(k, 0), prev_map.get(k, 0)
        result.append({"kategori": k, "current": round(curr), "prev": round(prev),
                       "growth": round((curr-prev)/prev*100, 1) if prev else None})
    result.sort(key=lambda x: (x["growth"] is None, -(x["growth"] or 0)))
    return result


@router.get("/top-products")
def top_products(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    rows = db.rpc("get_top_products", {"p_year": _int(year), "p_month": None, "p_kategori": _str(kategori), "p_branch": None, "p_limit": 20}).execute().data
    return [{"item_no": r["item_no"], "description": r["item_description"], "kategori": r["kategori"],
             "revenue": round(float(r["revenue"] or 0)), "qty": int(float(r["quantity"] or 0))} for r in rows]


@router.get("/heatmap")
def heatmap(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    rows = db.rpc("get_product_trend", {"p_year": _int(year), "p_branch": None}).execute().data
    if kategori and kategori != "all":
        selected = {k.strip() for k in kategori.split(",")}
        rows = [r for r in rows if r.get("kategori") in selected]

    grouped = defaultdict(lambda: defaultdict(float))
    all_cats = set()
    for r in rows:
        k, m = r["kategori"], r["month"]
        grouped[k][m] += float(r["revenue"] or 0)
        all_cats.add(k)

    return [{"kategori": k, **{MONTHS[m-1]: round(grouped[k].get(m, 0)) for m in range(1, 13)}} for k in sorted(all_cats)]
