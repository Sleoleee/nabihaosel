from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from datetime import date
from utils.db import get_client
from utils.calculations import get_customer_tier

router = APIRouter()

ROW_LIMIT = 100000


def load(db, year=None):
    q = db.table("transactions").select(
        "customer_code,customer_name,new_row_total,document_number,posting_date,year,status_payment"
    )
    if year and year != "all":
        q = q.eq("year", int(year))
    return q.limit(ROW_LIMIT).execute().data


def build_stats(data):
    stats = defaultdict(lambda: {"name": "", "revenue": 0, "docs": set(), "months": set(), "dates": []})
    for r in data:
        code = r.get("customer_code") or "UNKNOWN"
        stats[code]["name"] = r.get("customer_name") or code
        stats[code]["revenue"] += r.get("new_row_total") or 0
        if r.get("document_number"):
            stats[code]["docs"].add(r["document_number"])
        pd_str = r.get("posting_date")
        if pd_str:
            stats[code]["dates"].append(pd_str)
            stats[code]["months"].add(pd_str[:7])
    return stats


@router.get("/rfm")
def rfm(year: Optional[str] = Query(None)):
    db = get_client()
    data = load(db)
    stats = build_stats(data)
    all_dates = [r.get("posting_date") for r in data if r.get("posting_date")]
    if not all_dates:
        return {"matrix": [], "segments": []}
    cutoff = max(all_dates)

    customers = []
    for code, s in stats.items():
        last = max(s["dates"]) if s["dates"] else cutoff
        recency = (date.fromisoformat(cutoff) - date.fromisoformat(last)).days
        customers.append({"code": code, "name": s["name"], "recency": recency,
                          "frequency": len(s["docs"]), "monetary": s["revenue"]})

    if not customers:
        return {"matrix": [], "segments": []}

    rec_vals = sorted([c["recency"] for c in customers])
    freq_vals = sorted([c["frequency"] for c in customers])
    mon_vals = sorted([c["monetary"] for c in customers])

    def q4(val, vals, rev=False):
        n = len(vals)
        q25, q50, q75 = vals[n//4], vals[n//2], vals[3*n//4]
        if rev:
            return 4 if val <= q25 else 3 if val <= q50 else 2 if val <= q75 else 1
        return 4 if val >= q75 else 3 if val >= q50 else 2 if val >= q25 else 1

    for c in customers:
        r, f, m = q4(c["recency"], rec_vals, rev=True), q4(c["frequency"], freq_vals), q4(c["monetary"], mon_vals)
        c["r_score"], c["f_score"], c["m_score"] = r, f, m
        if r >= 3 and f >= 3 and m >= 3: c["segment"] = "Champions"
        elif f >= 3 and m >= 3: c["segment"] = "Loyal"
        elif r <= 2 and f >= 2 and m >= 2: c["segment"] = "At Risk"
        elif r == 1 and f <= 2: c["segment"] = "Lost"
        elif r >= 3 and f <= 2: c["segment"] = "Promising"
        else: c["segment"] = "Need Attention"

    matrix = defaultdict(lambda: {"count": 0, "revenue": 0})
    seg_summary = defaultdict(lambda: {"count": 0, "revenue": 0})
    for c in customers:
        matrix[(c["f_score"], c["m_score"])]["count"] += 1
        matrix[(c["f_score"], c["m_score"])]["revenue"] += c["monetary"]
        seg_summary[c["segment"]]["count"] += 1
        seg_summary[c["segment"]]["revenue"] += c["monetary"]

    return {
        "matrix": [{"f_score": f, "m_score": m, **v} for (f, m), v in matrix.items()],
        "segments": [{"segment": k, **v} for k, v in seg_summary.items()],
    }


@router.get("/tiers")
def tiers(year: Optional[str] = Query(None)):
    db = get_client()
    data = load(db)
    stats = build_stats(data)
    tier_data = defaultdict(lambda: {"count": 0, "revenue": 0, "customers": []})
    for code, s in stats.items():
        active_months = len(s["months"]) or 1
        avg = s["revenue"] / active_months
        tier = get_customer_tier(avg)
        tier_data[tier]["count"] += 1
        tier_data[tier]["revenue"] += s["revenue"]
        tier_data[tier]["customers"].append(s["name"])

    tier_order = ["Tier 1 — ≥30jt","Tier 2 — 20–30jt","Tier 3 — 15–20jt","Tier 4 — 10–15jt",
                  "Tier 5 — 7–10jt","Tier 6 — 6–7jt","Tier 7 — 5–6jt","Tier 8 — 4–5jt",
                  "Tier 9 — 3–4jt","Tier 10 — 2–3jt","Tier 11 — 1–2jt","Tier 12 — 500rb–1jt","Tier 13 — <500rb"]
    return [{"tier": t, "count": tier_data[t]["count"], "revenue": round(tier_data[t]["revenue"]),
             "customers": tier_data[t]["customers"][:5], "extra": max(0, len(tier_data[t]["customers"]) - 5)}
            for t in tier_order]


@router.get("/list")
def customer_list(year: Optional[str] = Query(None), tier: Optional[str] = Query(None),
                  search: Optional[str] = Query(None), sort: Optional[str] = Query("revenue"),
                  page: int = Query(1), limit: int = Query(25)):
    db = get_client()
    data = load(db, year)
    all_dates = [r.get("posting_date") for r in data if r.get("posting_date")]
    cutoff = max(all_dates) if all_dates else date.today().isoformat()
    stats = build_stats(data)

    rows = []
    for code, s in stats.items():
        active_months = len(s["months"]) or 1
        avg = s["revenue"] / active_months
        t = get_customer_tier(avg)
        bills = len(s["docs"])
        last = max(s["dates"]) if s["dates"] else ""
        days = (date.fromisoformat(cutoff) - date.fromisoformat(last)).days if last else 9999
        rows.append({"code": code, "name": s["name"], "tier": t, "revenue": round(s["revenue"]),
                     "avg_monthly": round(avg), "bills": bills, "active_months": active_months,
                     "last_purchase": last, "days_since_purchase": days, "payment_status": "OK", "segment": ""})

    if search:
        rows = [r for r in rows if search.lower() in r["name"].lower()]
    if tier:
        rows = [r for r in rows if r["tier"] == tier]
    rows.sort(key=lambda x: -x.get({"revenue":"revenue","bills":"bills","avg_monthly":"avg_monthly"}.get(sort,"revenue"), 0))
    total = len(rows)
    start = (page - 1) * limit
    return {"data": rows[start:start+limit], "total": total, "page": page, "limit": limit}


@router.get("/recency")
def recency(year: Optional[str] = Query(None)):
    db = get_client()
    data = load(db, year)
    all_dates = [r.get("posting_date") for r in data if r.get("posting_date")]
    cutoff = max(all_dates) if all_dates else date.today().isoformat()
    stats = build_stats(data)

    buckets = {"0–30": 0, "31–60": 0, "61–90": 0, "91–180": 0, "180+": 0}
    for s in stats.values():
        last = max(s["dates"]) if s["dates"] else None
        if not last:
            continue
        days = (date.fromisoformat(cutoff) - date.fromisoformat(last)).days
        if days <= 30: buckets["0–30"] += 1
        elif days <= 60: buckets["31–60"] += 1
        elif days <= 90: buckets["61–90"] += 1
        elif days <= 180: buckets["91–180"] += 1
        else: buckets["180+"] += 1
    return [{"bucket": k, "count": v} for k, v in buckets.items()]
