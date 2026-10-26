"""
Report Center — File 3: Product Performance.
Sheet 'Ringkasan Kategori' + 'Detail SKU x Bulan' (lebar, AutoFilter) + 'Peluang Cross-sell'.
Sumber: agg_category_month, agg_customer_category_month, agg_customer_month, agg_sku_month,
dim_item, agg_category_pairing, dim_customer. Default 'hanya produk inti' = ON (CLAUDE.md).
"""
import io
from collections import defaultdict
from openpyxl import Workbook
from openpyxl.utils import get_column_letter

import config
from reports import formatting as F
from reports.salesperson import _period_months, _mlabel


def _status(days):
    if days is None or days <= 90:
        return "AKTIF"
    return "TIDAK AKTIF" if days <= 180 else "HILANG"


def _tren(g):
    if g is None:
        return "n/a"
    if g > config.TREND_UP_THRESHOLD:
        return "Tumbuh"
    if g < config.TREND_DOWN_THRESHOLD:
        return "Turun"
    return "Stabil"


def build(db, dari, sampai, channels=None, produk_inti=True, coverage_warnings=None):
    months = _period_months(dari, sampai)
    monthset = set(months)
    prior = {(y - 1, m) for (y, m) in months}          # YoY: bulan sama tahun lalu
    years = sorted({y for y, _ in months} | {y - 1 for y, _ in months})
    chan_set = set(channels) if channels else None
    noncore = {c.upper() for c in config.NON_CORE_CATEGORIES}

    def ch_ok(ch):
        return (not chan_set) or ch in chan_set

    acat = db.table("agg_category_month").select(
        "kategori,tahun,bulan,channel,revenue").in_("tahun", years).limit(1000000).execute().data or []
    accm = db.table("agg_customer_category_month").select(
        "customer_code,kategori,tahun,bulan,channel,revenue").in_("tahun", years).limit(1000000).execute().data or []
    acm = db.table("agg_customer_month").select(
        "customer_code,tahun,bulan,channel,revenue").in_("tahun", years).limit(1000000).execute().data or []

    # --- Ringkasan Kategori ---
    kat_rev = defaultdict(float); kat_prior = defaultdict(float)
    for r in acat:
        k = r["kategori"]
        if produk_inti and str(k or "").upper() in noncore:
            continue
        if not ch_ok(r.get("channel")):
            continue
        y, m = int(r["tahun"]), int(r["bulan"]); rev = float(r.get("revenue") or 0)
        if (y, m) in monthset: kat_rev[k] += rev
        elif (y, m) in prior: kat_prior[k] += rev
    kat_buyers = defaultdict(set)
    for r in accm:
        k = r["kategori"]
        if produk_inti and str(k or "").upper() in noncore:
            continue
        if not ch_ok(r.get("channel")):
            continue
        if (int(r["tahun"]), int(r["bulan"])) in monthset:
            kat_buyers[k].add(r["customer_code"])
    active_custs = {r["customer_code"] for r in acm
                    if (int(r["tahun"]), int(r["bulan"])) in monthset and ch_ok(r.get("channel"))
                    and float(r.get("revenue") or 0) > 0}
    n_active = len(active_custs) or 1
    tot_rev = sum(kat_rev.values()) or 1

    wb = Workbook()
    ws = wb.active; ws.title = "Ringkasan Kategori"
    filt = {"Channel": ", ".join(channels) if channels else "Semua", "Produk": "Hanya inti" if produk_inti else "Semua"}
    start = F.write_standard_header(ws, "Product Performance — Ringkasan Kategori", dari, sampai, filt, coverage_warnings)
    head = ["Kategori", "Revenue", "Kontribusi %", "Growth YoY", "Jumlah Customer Pembeli", "Penetrasi %", "Status Tren"]
    for j, h in enumerate(head, 1): ws.cell(start, j, h)
    F.style_table_header(ws, start, len(head))
    r = start + 1
    for k in sorted(kat_rev, key=lambda x: -kat_rev[x]):
        rev = kat_rev[k]; pri = kat_prior.get(k, 0)
        growth = ((rev - pri) / pri) if pri > 0 else None
        F.rupiah(ws.cell(r, 2, round(rev)))
        F.persen(ws.cell(r, 3, rev / tot_rev))
        gc = ws.cell(r, 4, growth if growth is not None else "n/a")
        if growth is not None: F.persen(gc)
        ws.cell(r, 1, k); ws.cell(r, 5, len(kat_buyers.get(k, ())))
        F.persen(ws.cell(r, 6, len(kat_buyers.get(k, ())) / n_active))
        tc = ws.cell(r, 7, _tren(growth))
        _fill = {"Tumbuh": F.GREEN, "Turun": F.RED, "Stabil": F.YELLOW}.get(_tren(growth))
        if _fill: tc.fill = _fill
        r += 1
    ws.auto_filter.ref = f"A{start}:{get_column_letter(len(head))}{r-1}"
    ws.freeze_panes = f"A{start+1}"
    for col, w in zip("ABCDEFG", [26, 16, 12, 11, 20, 11, 11]): ws.column_dimensions[col].width = w

    # --- Detail SKU x Bulan (lintas channel; agg_sku_month tak punya channel) ---
    dim_item = {r["item_no"]: r for r in (db.table("dim_item").select(
        "item_no,item_desc,kategori,brand,is_produk_inti").limit(1000000).execute().data or [])}
    askm = db.table("agg_sku_month").select(
        "item_no,tahun,bulan,revenue").in_("tahun", sorted({y for y, _ in months})).limit(1000000).execute().data or []
    sku = defaultdict(lambda: defaultdict(float))
    for r in askm:
        it = r["item_no"]; d = dim_item.get(it, {})
        if produk_inti and not d.get("is_produk_inti", True):
            continue
        y, m = int(r["tahun"]), int(r["bulan"])
        if (y, m) in monthset:
            sku[it][(y, m)] += float(r.get("revenue") or 0)

    cov2 = list(coverage_warnings or []) + ["Detail SKU bersifat lintas channel (agregat SKU tak menyimpan channel)."]
    ws2 = wb.create_sheet("Detail SKU x Bulan")
    start2 = F.write_standard_header(ws2, "Detail Brand × Kategori × SKU × Bulan", dari, sampai, filt, cov2)
    head2 = ["Brand", "Kategori", "SKU"] + [_mlabel(y, m) for y, m in months] + ["Total"]
    for j, h in enumerate(head2, 1): ws2.cell(start2, j, h)
    F.style_table_header(ws2, start2, len(head2))
    rr = start2 + 1
    for it, mm in sorted(sku.items(), key=lambda kv: -sum(kv[1].values())):
        d = dim_item.get(it, {})
        ws2.cell(rr, 1, d.get("brand") or "(non-brand)"); ws2.cell(rr, 2, d.get("kategori") or "")
        ws2.cell(rr, 3, f"{it} — {d.get('item_desc') or ''}")
        for j, (y, m) in enumerate(months, 4):
            F.rupiah(ws2.cell(rr, j, round(mm.get((y, m), 0))))
        F.rupiah(ws2.cell(rr, 3 + len(months) + 1, round(sum(mm.values()))))
        rr += 1
    ws2.auto_filter.ref = f"A{start2}:{get_column_letter(len(head2))}{rr-1}"
    ws2.freeze_panes = f"D{start2+1}"
    for col, w in zip("ABC", [16, 24, 34]): ws2.column_dimensions[col].width = w

    # --- Peluang Cross-sell (customer AKTIF) ---
    # kategori dibeli (lifetime) per customer + revenue periode
    cust_kats = defaultdict(set); cust_perrev = defaultdict(float)
    for r in accm:
        if produk_inti and str(r["kategori"] or "").upper() in noncore:
            continue
        cust_kats[r["customer_code"]].add(r["kategori"])
        if (int(r["tahun"]), int(r["bulan"])) in monthset and ch_ok(r.get("channel")):
            cust_perrev[r["customer_code"]] += float(r.get("revenue") or 0)
    pairs = db.table("agg_category_pairing").select("kategori_a,kategori_b,lift").limit(1000000).execute().data or []
    paired = defaultdict(list)                      # kat -> [(partner, lift)]
    for p in pairs:
        a, b, lift = p["kategori_a"], p["kategori_b"], float(p.get("lift") or 0)
        if produk_inti and (a.upper() in noncore or b.upper() in noncore):
            continue
        paired[a].append((b, lift)); paired[b].append((a, lift))
    dimc = {r["customer_code"]: r for r in (db.table("dim_customer").select(
        "customer_code,customer_name,days_since_last_order,salesperson_utama").limit(1000000).execute().data or [])}

    ws3 = wb.create_sheet("Peluang Cross-sell")
    start3 = F.write_standard_header(ws3, "Peluang Cross-sell (customer AKTIF)", dari, sampai, filt, coverage_warnings)
    head3 = ["Customer", "Salesperson", "Status", "Kategori Sudah Dibeli", "Kategori Disarankan", "Revenue Customer"]
    for j, h in enumerate(head3, 1): ws3.cell(start3, j, h)
    F.style_table_header(ws3, start3, len(head3))
    r3 = start3 + 1
    rows3 = []
    for c, bought in cust_kats.items():
        d = dimc.get(c, {})
        if _status(d.get("days_since_last_order")) != "AKTIF":
            continue
        if cust_perrev.get(c, 0) <= 0:
            continue
        cand = {}
        for k in bought:
            for partner, lift in paired.get(k, ()):
                if partner not in bought:
                    cand[partner] = max(cand.get(partner, 0), lift)
        saran = [k for k, _ in sorted(cand.items(), key=lambda x: -x[1])[:2]]
        if not saran:
            continue
        rows3.append((cust_perrev[c], {
            "cust": f"{c} — {d.get('customer_name') or c}", "slp": d.get("salesperson_utama") or "",
            "status": "AKTIF", "bought": ", ".join(sorted(bought)[:8]),
            "saran": ", ".join(saran), "rev": round(cust_perrev[c])}))
    for _, d in sorted(rows3, key=lambda x: -x[0]):
        ws3.cell(r3, 1, d["cust"]); ws3.cell(r3, 2, d["slp"]); ws3.cell(r3, 3, d["status"])
        ws3.cell(r3, 4, d["bought"]); ws3.cell(r3, 5, d["saran"]); F.rupiah(ws3.cell(r3, 6, d["rev"]))
        r3 += 1
    ws3.auto_filter.ref = f"A{start3}:{get_column_letter(len(head3))}{max(r3-1, start3)}"
    ws3.freeze_panes = f"A{start3+1}"
    for col, w in zip("ABCDEF", [28, 20, 10, 44, 28, 16]): ws3.column_dimensions[col].width = w

    bio = io.BytesIO(); wb.save(bio); bio.seek(0)
    return bio.getvalue()
