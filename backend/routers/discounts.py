from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


def _int(val):
    return int(val) if val and val != "all" else None


def load_data(db, year=None, kategori=None):
    params = {
        "p_year": _int(year),
        "p_branch": None,
    }
    rows = db.rpc("get_discount_overview", params).execute().data

    # For endpoints that need per-row detail, we still need a direct query
    # but filtered down to a manageable set via year filter
    q = db.table("transactions").select(
        "new_row_total, row_total, disc_for_document, document_number, posting_date, year, kategori, customer_code, customer_name"
    )
    if year and year != "all":
        q = q.eq("year", int(year))
    if kategori and kategori != "all":
        q = q.eq("kategori", kategori)
    return q.execute().data


@router.get("/overview")
def overview(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    data = load_data(db, year, kategori)

    total_lost = 0
    bills_with_disc = set()
    disc_values = []
    total_bills = set()

    for r in data:
        row_total = r.get("row_total") or 0
        new_row_total = r.get("new_row_total") or 0
        total_lost += max(0, row_total - new_row_total)
        doc = r.get("document_number")
        if doc:
            total_bills.add(doc)
            disc = r.get("disc_for_document") or 0
            if disc > 0:
                bills_with_disc.add(doc)
                disc_values.append(disc)

    avg_disc = sum(disc_values) / len(disc_values) if disc_values else 0
    pct_bills_with_disc = len(bills_with_disc) / len(total_bills) * 100 if total_bills else 0

    return {
        "revenue_lost": round(total_lost),
        "pct_bills_with_disc": round(pct_bills_with_disc, 1),
        "avg_disc_for_document": round(avg_disc, 1),
        "bills_with_disc": len(bills_with_disc),
    }


@router.get("/distribution")
def distribution(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    data = load_data(db, year, kategori)

    buckets = {"0%": {"bills": set(), "lost": 0}, "1–5%": {"bills": set(), "lost": 0},
               "6–10%": {"bills": set(), "lost": 0}, "11–20%": {"bills": set(), "lost": 0},
               "21–50%": {"bills": set(), "lost": 0}}

    doc_disc = {}
    doc_lost = defaultdict(float)

    for r in data:
        doc = r.get("document_number")
        if not doc:
            continue
        disc = r.get("disc_for_document") or 0
        if doc not in doc_disc:
            doc_disc[doc] = disc
        doc_lost[doc] += max(0, (r.get("row_total") or 0) - (r.get("new_row_total") or 0))

    for doc, disc in doc_disc.items():
        lost = doc_lost[doc]
        if disc == 0: b = "0%"
        elif disc <= 5: b = "1–5%"
        elif disc <= 10: b = "6–10%"
        elif disc <= 20: b = "11–20%"
        else: b = "21–50%"
        buckets[b]["bills"].add(doc)
        buckets[b]["lost"] += lost

    return [{"bucket": k, "bills": len(v["bills"]), "revenue_lost": round(v["lost"])} for k, v in buckets.items()]


@router.get("/monthly")
def monthly(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    data = load_data(db, year, kategori)

    monthly_rev = defaultdict(float)
    monthly_lost = defaultdict(float)

    for r in data:
        pd_str = r.get("posting_date")
        if not pd_str:
            continue
        m = int(pd_str[5:7])
        new_rt = r.get("new_row_total") or 0
        rt = r.get("row_total") or 0
        monthly_rev[m] += new_rt
        monthly_lost[m] += max(0, rt - new_rt)

    return [
        {"month": MONTHS[m-1], "retained": round(monthly_rev[m]), "lost": round(monthly_lost[m])}
        for m in range(1, 13)
    ]


@router.get("/by-customer")
def by_customer(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    data = load_data(db, year, kategori)

    cust_stats = defaultdict(lambda: {
        "name": "", "bills": set(), "disc_bills": set(),
        "disc_values": [], "total_discount": 0,
    })

    doc_to_cust = {}
    doc_disc = {}
    doc_lost = defaultdict(float)

    for r in data:
        doc = r.get("document_number")
        code = r.get("customer_code") or "UNKNOWN"
        if doc:
            doc_to_cust[doc] = code
            disc = r.get("disc_for_document") or 0
            if doc not in doc_disc:
                doc_disc[doc] = disc
            doc_lost[doc] += max(0, (r.get("row_total") or 0) - (r.get("new_row_total") or 0))
        cust_stats[code]["name"] = r.get("customer_name") or code

    for doc, code in doc_to_cust.items():
        cust_stats[code]["bills"].add(doc)
        disc = doc_disc.get(doc, 0)
        if disc > 0:
            cust_stats[code]["disc_bills"].add(doc)
            cust_stats[code]["disc_values"].append(disc)
        cust_stats[code]["total_discount"] += doc_lost[doc]

    result = []
    for code, s in cust_stats.items():
        total_bills = len(s["bills"])
        disc_bills = len(s["disc_bills"])
        pct = disc_bills / total_bills * 100 if total_bills else 0
        avg_disc = sum(s["disc_values"]) / len(s["disc_values"]) if s["disc_values"] else 0
        result.append({
            "name": s["name"],
            "total_bills": total_bills,
            "bills_with_disc": disc_bills,
            "pct_with_disc": round(pct, 1),
            "avg_disc": round(avg_disc, 1),
            "total_discount_value": round(s["total_discount"]),
        })

    result.sort(key=lambda x: -x["total_discount_value"])
    return result[:50]


@router.get("/price-integrity")
def price_integrity(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    q = db.table("transactions").select("harga_awal, harga_jual, kategori, year")
    if year and year != "all":
        q = q.eq("year", int(year))
    if kategori and kategori != "all":
        q = q.eq("kategori", kategori)
    data = q.execute().data

    cat_stats = defaultdict(lambda: {"harga_awal": [], "harga_jual": []})
    for r in data:
        k = r.get("kategori") or "Lainnya"
        ha = r.get("harga_awal") or 0
        hj = r.get("harga_jual") or 0
        if ha > 0:
            cat_stats[k]["harga_awal"].append(ha)
            cat_stats[k]["harga_jual"].append(hj)

    result = []
    for k, s in cat_stats.items():
        avg_ha = sum(s["harga_awal"]) / len(s["harga_awal"]) if s["harga_awal"] else 0
        avg_hj = sum(s["harga_jual"]) / len(s["harga_jual"]) if s["harga_jual"] else 0
        gap_pct = (avg_ha - avg_hj) / avg_ha * 100 if avg_ha > 0 else 0
        result.append({
            "kategori": k,
            "avg_harga_awal": round(avg_ha),
            "avg_harga_jual": round(avg_hj),
            "gap_pct": round(gap_pct, 1),
        })

    result.sort(key=lambda x: -x["gap_pct"])
    return result
