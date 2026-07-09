from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from datetime import date
from utils.db import get_client
from utils.calculations import get_customer_tier

router = APIRouter()


def _int(val):
    return int(val) if val and val != "all" else None


def _load_customer_summary(db, year=None):
    rows = db.rpc("get_customer_summary", {"p_year": _int(year)}).execute().data
    return rows


def _compute_rfm(rows):
    if not rows:
        return [], []

    all_last = [r["last_purchase"] for r in rows if r.get("last_purchase")]
    if not all_last:
        return [], []
    cutoff = max(all_last)

    customers = []
    for r in rows:
        last = r.get("last_purchase") or cutoff
        recency = (date.fromisoformat(cutoff) - date.fromisoformat(last)).days
        customers.append({
            "code": r["customer_code"],
            "name": r["customer_name"],
            "recency": recency,
            "frequency": int(r.get("bills") or 0),
            "monetary": float(r.get("revenue") or 0),
        })

    rec_vals = sorted([c["recency"] for c in customers])
    freq_vals = sorted([c["frequency"] for c in customers])
    mon_vals = sorted([c["monetary"] for c in customers])

    def quartile(val, vals, reverse=False):
        n = len(vals)
        q25, q50, q75 = vals[n // 4], vals[n // 2], vals[3 * n // 4]
        if reverse:
            if val <= q25: return 4
            elif val <= q50: return 3
            elif val <= q75: return 2
            else: return 1
        else:
            if val >= q75: return 4
            elif val >= q50: return 3
            elif val >= q25: return 2
            else: return 1

    for c in customers:
        c["r_score"] = quartile(c["recency"], rec_vals, reverse=True)
        c["f_score"] = quartile(c["frequency"], freq_vals)
        c["m_score"] = quartile(c["monetary"], mon_vals)
        r, f, m = c["r_score"], c["f_score"], c["m_score"]
        if r >= 3 and f >= 3 and m >= 3: c["segment"] = "Champions"
        elif f >= 3 and m >= 3: c["segment"] = "Loyal"
        elif r <= 2 and f >= 2 and m >= 2: c["segment"] = "At Risk"
        elif r == 1 and f <= 2: c["segment"] = "Lost"
        elif r >= 3 and f <= 2: c["segment"] = "Promising"
        else: c["segment"] = "Need Attention"

    return customers, cutoff


@router.get("/rfm")
def rfm(year: Optional[str] = Query(None)):
    db = get_client()
    rows = _load_customer_summary(db)  # RFM always uses all data
    customers, _ = _compute_rfm(rows)

    if not customers:
        return {"matrix": [], "segments": []}

    matrix = {}
    for f in range(1, 5):
        for m in range(1, 5):
            matrix[(f, m)] = {"count": 0, "revenue": 0}

    segment_summary = defaultdict(lambda: {"count": 0, "revenue": 0})
    for c in customers:
        key = (c["f_score"], c["m_score"])
        matrix[key]["count"] += 1
        matrix[key]["revenue"] += c["monetary"]
        segment_summary[c["segment"]]["count"] += 1
        segment_summary[c["segment"]]["revenue"] += c["monetary"]

    matrix_list = [
        {"f_score": f, "m_score": m, "count": v["count"], "revenue": round(v["revenue"])}
        for (f, m), v in matrix.items()
    ]

    return {
        "matrix": matrix_list,
        "segments": [{"segment": k, **v} for k, v in segment_summary.items()],
    }


@router.get("/tiers")
def tiers(year: Optional[str] = Query(None)):
    db = get_client()
    rows = _load_customer_summary(db)  # tiers use all-time data

    tier_data = defaultdict(lambda: {"count": 0, "revenue": 0, "customers": []})
    for r in rows:
        total_rev = float(r.get("revenue") or 0)
        active_months = int(r.get("months_active") or 1)
        avg = total_rev / active_months if active_months > 0 else 0
        tier = get_customer_tier(avg)
        tier_data[tier]["count"] += 1
        tier_data[tier]["revenue"] += total_rev
        tier_data[tier]["customers"].append(r.get("customer_name") or r["customer_code"])

    tier_order = [
        "Tier 1 — ≥30jt", "Tier 2 — 20–30jt", "Tier 3 — 15–20jt",
        "Tier 4 — 10–15jt", "Tier 5 — 7–10jt", "Tier 6 — 6–7jt",
        "Tier 7 — 5–6jt", "Tier 8 — 4–5jt", "Tier 9 — 3–4jt",
        "Tier 10 — 2–3jt", "Tier 11 — 1–2jt", "Tier 12 — 500rb–1jt",
        "Tier 13 — <500rb",
    ]

    result = []
    for t in tier_order:
        d = tier_data.get(t, {"count": 0, "revenue": 0, "customers": []})
        result.append({
            "tier": t,
            "count": d["count"],
            "revenue": round(d["revenue"]),
            "customers": d["customers"][:5],
            "extra": max(0, len(d["customers"]) - 5),
        })
    return result


@router.get("/list")
def customer_list(
    year: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    segment: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort: Optional[str] = Query("revenue"),
    page: int = Query(1),
    limit: int = Query(25),
):
    db = get_client()
    rows = _load_customer_summary(db, year)
    cutoff_rows = db.rpc("get_customer_summary", {"p_year": None}).execute().data
    all_last = [r["last_purchase"] for r in cutoff_rows if r.get("last_purchase")]
    cutoff = max(all_last) if all_last else date.today().isoformat()

    result = []
    for r in rows:
        total_rev = float(r.get("revenue") or 0)
        active_months = int(r.get("months_active") or 1)
        avg = total_rev / active_months if active_months > 0 else 0
        tier_val = get_customer_tier(avg)
        bills = int(r.get("bills") or 0)
        last = r.get("last_purchase") or ""
        days = (date.fromisoformat(cutoff) - date.fromisoformat(last)).days if last else 9999
        result.append({
            "code": r["customer_code"],
            "name": r.get("customer_name") or r["customer_code"],
            "tier": tier_val,
            "revenue": round(total_rev),
            "avg_monthly": round(avg),
            "bills": bills,
            "active_months": active_months,
            "last_purchase": last,
            "days_since_purchase": days,
            "payment_status": "OK",
            "segment": "",
        })

    if search:
        result = [r for r in result if search.lower() in r["name"].lower()]
    if tier:
        result = [r for r in result if r["tier"] == tier]

    sort_key = {"revenue": "revenue", "bills": "bills", "avg_monthly": "avg_monthly"}.get(sort, "revenue")
    result.sort(key=lambda x: -x.get(sort_key, 0))

    total = len(result)
    start = (page - 1) * limit
    return {"data": result[start:start + limit], "total": total, "page": page, "limit": limit}


@router.get("/recency")
def recency(year: Optional[str] = Query(None)):
    db = get_client()
    rows = _load_customer_summary(db, year)
    all_last_global = [r["last_purchase"] for r in db.rpc("get_customer_summary", {"p_year": None}).execute().data if r.get("last_purchase")]
    cutoff = max(all_last_global) if all_last_global else date.today().isoformat()

    buckets = {"0–30": 0, "31–60": 0, "61–90": 0, "91–180": 0, "180+": 0}
    for r in rows:
        last = r.get("last_purchase")
        if not last:
            continue
        days = (date.fromisoformat(cutoff) - date.fromisoformat(last)).days
        if days <= 30: buckets["0–30"] += 1
        elif days <= 60: buckets["31–60"] += 1
        elif days <= 90: buckets["61–90"] += 1
        elif days <= 180: buckets["91–180"] += 1
        else: buckets["180+"] += 1

    return [{"bucket": k, "count": v} for k, v in buckets.items()]
