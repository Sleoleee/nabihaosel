from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from datetime import date
from utils.db import get_client
from utils.calculations import get_customer_tier

router = APIRouter()


def _int(val):
    return int(val) if val and val != "all" else None


def load(db, year=None):
    return db.rpc("get_customer_summary", {"p_year": _int(year)}).execute().data


def cutoff_date(db):
    rows = db.rpc("get_customer_summary", {"p_year": None}).execute().data
    dates = [r["last_purchase"] for r in rows if r.get("last_purchase")]
    return max(dates) if dates else date.today().isoformat()


@router.get("/rfm")
def rfm(year: Optional[str] = Query(None)):
    db = get_client()
    rows = load(db)
    if not rows: return {"matrix": [], "segments": []}
    cutoff = max(r["last_purchase"] for r in rows if r.get("last_purchase"))

    customers = [{"code": r["customer_code"], "name": r.get("customer_name"),
                  "recency": (date.fromisoformat(cutoff) - date.fromisoformat(r["last_purchase"])).days if r.get("last_purchase") else 9999,
                  "frequency": int(r.get("bills") or 0), "monetary": float(r.get("revenue") or 0)} for r in rows]

    rec_vals = sorted([c["recency"] for c in customers])
    freq_vals = sorted([c["frequency"] for c in customers])
    mon_vals = sorted([c["monetary"] for c in customers])

    def q4(val, vals, rev=False):
        n = len(vals)
        q25, q50, q75 = vals[n//4], vals[n//2], vals[3*n//4]
        if rev: return 4 if val<=q25 else 3 if val<=q50 else 2 if val<=q75 else 1
        return 4 if val>=q75 else 3 if val>=q50 else 2 if val>=q25 else 1

    for c in customers:
        r, f, m = q4(c["recency"], rec_vals, rev=True), q4(c["frequency"], freq_vals), q4(c["monetary"], mon_vals)
        c["r_score"], c["f_score"], c["m_score"] = r, f, m
        if r>=3 and f>=3 and m>=3: c["segment"] = "Champions"
        elif f>=3 and m>=3: c["segment"] = "Loyal"
        elif r<=2 and f>=2 and m>=2: c["segment"] = "At Risk"
        elif r==1 and f<=2: c["segment"] = "Lost"
        elif r>=3 and f<=2: c["segment"] = "Promising"
        else: c["segment"] = "Need Attention"

    matrix = defaultdict(lambda: {"count": 0, "revenue": 0})
    seg = defaultdict(lambda: {"count": 0, "revenue": 0})
    for c in customers:
        matrix[(c["f_score"], c["m_score"])]["count"] += 1
        matrix[(c["f_score"], c["m_score"])]["revenue"] += c["monetary"]
        seg[c["segment"]]["count"] += 1
        seg[c["segment"]]["revenue"] += c["monetary"]

    return {"matrix": [{"f_score": f, "m_score": m, **v} for (f,m),v in matrix.items()],
            "segments": [{"segment": k, **v} for k,v in seg.items()]}


@router.get("/tiers")
def tiers(year: Optional[str] = Query(None)):
    db = get_client()
    rows = load(db)
    tier_data = defaultdict(lambda: {"count": 0, "revenue": 0, "customers": []})
    for r in rows:
        rev = float(r.get("revenue") or 0)
        months = int(r.get("months_active") or 1)
        t = get_customer_tier(rev / months)
        tier_data[t]["count"] += 1
        tier_data[t]["revenue"] += rev
        tier_data[t]["customers"].append(r.get("customer_name") or r["customer_code"])

    tier_order = ["Tier 1 — ≥30jt","Tier 2 — 20–30jt","Tier 3 — 15–20jt","Tier 4 — 10–15jt",
                  "Tier 5 — 7–10jt","Tier 6 — 6–7jt","Tier 7 — 5–6jt","Tier 8 — 4–5jt",
                  "Tier 9 — 3–4jt","Tier 10 — 2–3jt","Tier 11 — 1–2jt","Tier 12 — 500rb–1jt","Tier 13 — <500rb"]
    return [{"tier": t, "count": tier_data[t]["count"], "revenue": round(tier_data[t]["revenue"]),
             "customers": tier_data[t]["customers"][:5], "extra": max(0, len(tier_data[t]["customers"])-5)} for t in tier_order]


@router.get("/list")
def customer_list(year: Optional[str] = Query(None), tier: Optional[str] = Query(None),
                  search: Optional[str] = Query(None), sort: Optional[str] = Query("revenue"),
                  page: int = Query(1), limit: int = Query(25)):
    db = get_client()
    rows = load(db, year)
    cutoff = cutoff_date(db)

    result = []
    for r in rows:
        rev = float(r.get("revenue") or 0)
        months = int(r.get("months_active") or 1)
        avg = rev / months
        t = get_customer_tier(avg)
        last = r.get("last_purchase") or ""
        days = (date.fromisoformat(cutoff) - date.fromisoformat(last)).days if last else 9999
        result.append({"code": r["customer_code"], "name": r.get("customer_name") or r["customer_code"],
                        "tier": t, "revenue": round(rev), "avg_monthly": round(avg),
                        "bills": int(r.get("bills") or 0), "active_months": months,
                        "last_purchase": last, "days_since_purchase": days, "payment_status": "OK", "segment": ""})

    if search: result = [r for r in result if search.lower() in r["name"].lower()]
    if tier: result = [r for r in result if r["tier"] == tier]
    result.sort(key=lambda x: -x.get({"revenue":"revenue","bills":"bills","avg_monthly":"avg_monthly"}.get(sort,"revenue"), 0))
    total = len(result)
    start = (page-1)*limit
    return {"data": result[start:start+limit], "total": total, "page": page, "limit": limit}


@router.get("/recency")
def recency(year: Optional[str] = Query(None)):
    db = get_client()
    rows = load(db, year)
    cutoff = cutoff_date(db)
    buckets = {"0–30": 0, "31–60": 0, "61–90": 0, "91–180": 0, "180+": 0}
    for r in rows:
        last = r.get("last_purchase")
        if not last: continue
        days = (date.fromisoformat(cutoff) - date.fromisoformat(last)).days
        if days<=30: buckets["0–30"]+=1
        elif days<=60: buckets["31–60"]+=1
        elif days<=90: buckets["61–90"]+=1
        elif days<=180: buckets["91–180"]+=1
        else: buckets["180+"]+=1
    return [{"bucket": k, "count": v} for k,v in buckets.items()]
