from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client
from utils.calculations import get_customer_tier

router = APIRouter()


def load_transactions(db, year=None):
    data = db.table("transactions").select(
        "customer_code, customer_name, new_row_total, document_number, posting_date, year, status_payment, slp_name"
    ).execute().data
    if year and year != "all":
        data = [r for r in data if r.get("year") == int(year)]
    return data


def build_customer_stats(data):
    stats = defaultdict(lambda: {
        "name": "", "revenues": [], "documents": set(),
        "months": set(), "dates": [], "payments": [],
    })

    for r in data:
        code = r.get("customer_code") or "UNKNOWN"
        stats[code]["name"] = r.get("customer_name") or code
        rev = r.get("new_row_total") or 0
        stats[code]["revenues"].append(rev)
        doc = r.get("document_number")
        if doc:
            stats[code]["documents"].add(doc)
        pd_str = r.get("posting_date")
        if pd_str:
            stats[code]["dates"].append(pd_str)
            stats[code]["months"].add(pd_str[:7])
        pay = r.get("status_payment")
        if pay:
            stats[code]["payments"].append(pay)

    return stats


@router.get("/rfm")
def rfm(year: Optional[str] = Query(None)):
    db = get_client()
    data = load_transactions(db)  # RFM uses all data

    stats = build_customer_stats(data)

    import datetime
    all_dates = [r.get("posting_date") for r in data if r.get("posting_date")]
    if not all_dates:
        return {"matrix": [], "segments": []}

    cutoff = max(all_dates)

    customers = []
    for code, s in stats.items():
        total_rev = sum(s["revenues"])
        bills = len(s["documents"])
        last_date = max(s["dates"]) if s["dates"] else cutoff
        from datetime import date
        recency = (date.fromisoformat(cutoff) - date.fromisoformat(last_date)).days
        customers.append({
            "code": code, "name": s["name"],
            "recency": recency, "frequency": bills, "monetary": total_rev,
        })

    if not customers:
        return {"matrix": [], "segments": []}

    # Quartile scoring
    rec_vals = sorted([c["recency"] for c in customers])
    freq_vals = sorted([c["frequency"] for c in customers])
    mon_vals = sorted([c["monetary"] for c in customers])

    def quartile(val, vals, reverse=False):
        n = len(vals)
        q25 = vals[n // 4]
        q50 = vals[n // 2]
        q75 = vals[3 * n // 4]
        if reverse:  # lower is better (recency)
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

    # Build 4x4 matrix (F x M)
    matrix = {}
    for f in range(1, 5):
        for m in range(1, 5):
            matrix[(f, m)] = {"count": 0, "revenue": 0}

    for c in customers:
        key = (c["f_score"], c["m_score"])
        matrix[key]["count"] += 1
        matrix[key]["revenue"] += c["monetary"]

    matrix_list = [
        {"f_score": f, "m_score": m, "count": v["count"], "revenue": round(v["revenue"])}
        for (f, m), v in matrix.items()
    ]

    segment_summary = defaultdict(lambda: {"count": 0, "revenue": 0})
    for c in customers:
        segment_summary[c["segment"]]["count"] += 1
        segment_summary[c["segment"]]["revenue"] += c["monetary"]

    return {
        "matrix": matrix_list,
        "segments": [{"segment": k, **v} for k, v in segment_summary.items()],
    }


@router.get("/tiers")
def tiers(year: Optional[str] = Query(None)):
    db = get_client()
    data = load_transactions(db)

    stats = build_customer_stats(data)

    tier_data = defaultdict(lambda: {"count": 0, "revenue": 0, "customers": []})

    for code, s in stats.items():
        total_rev = sum(s["revenues"])
        active_months = len(s["months"])
        avg = total_rev / active_months if active_months > 0 else 0
        tier = get_customer_tier(avg)
        tier_data[tier]["count"] += 1
        tier_data[tier]["revenue"] += total_rev
        tier_data[tier]["customers"].append(s["name"])

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
    data = load_transactions(db, year)

    stats = build_customer_stats(data)

    import datetime
    all_dates = [r.get("posting_date") for r in db.table("transactions").select("posting_date").execute().data if r.get("posting_date")]
    cutoff = max(all_dates) if all_dates else datetime.date.today().isoformat()

    rows = []
    for code, s in stats.items():
        total_rev = sum(s["revenues"])
        active_months = len(s["months"])
        avg = total_rev / active_months if active_months > 0 else 0
        customer_tier = get_customer_tier(avg)
        bills = len(s["documents"])
        last_date = max(s["dates"]) if s["dates"] else ""

        from datetime import date
        days_since = (date.fromisoformat(cutoff) - date.fromisoformat(last_date)).days if last_date else 9999

        late_count = s["payments"].count("Late")
        pay_status = "Late" if late_count > len(s["payments"]) / 2 else "OK"

        rows.append({
            "code": code,
            "name": s["name"],
            "tier": customer_tier,
            "revenue": round(total_rev),
            "avg_monthly": round(avg),
            "bills": bills,
            "active_months": active_months,
            "last_purchase": last_date,
            "days_since_purchase": days_since,
            "payment_status": pay_status,
            "segment": "",  # computed separately for perf
        })

    if search:
        rows = [r for r in rows if search.lower() in r["name"].lower()]
    if tier:
        rows = [r for r in rows if r["tier"] == tier]

    sort_key = {"revenue": "revenue", "bills": "bills", "avg_monthly": "avg_monthly"}.get(sort, "revenue")
    rows.sort(key=lambda x: -x.get(sort_key, 0))

    total = len(rows)
    start = (page - 1) * limit
    return {"data": rows[start:start + limit], "total": total, "page": page, "limit": limit}


@router.get("/recency")
def recency(year: Optional[str] = Query(None)):
    db = get_client()
    data = load_transactions(db, year)

    stats = build_customer_stats(data)

    all_dates_global = [r.get("posting_date") for r in db.table("transactions").select("posting_date").execute().data if r.get("posting_date")]
    cutoff = max(all_dates_global) if all_dates_global else ""

    from datetime import date
    buckets = {"0–30": 0, "31–60": 0, "61–90": 0, "91–180": 0, "180+": 0}

    for code, s in stats.items():
        last = max(s["dates"]) if s["dates"] else None
        if not last or not cutoff:
            continue
        days = (date.fromisoformat(cutoff) - date.fromisoformat(last)).days
        if days <= 30: buckets["0–30"] += 1
        elif days <= 60: buckets["31–60"] += 1
        elif days <= 90: buckets["61–90"] += 1
        elif days <= 180: buckets["91–180"] += 1
        else: buckets["180+"] += 1

    return [{"bucket": k, "count": v} for k, v in buckets.items()]
