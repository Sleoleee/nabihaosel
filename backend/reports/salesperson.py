"""
Report Center — File 1: Salesperson Performance.
Sheet 'Ringkasan SP' (satu baris per salesperson) + 'Detail SP x Customer' (lebar,
bulan jadi kolom, AutoFilter). Sumber: agg_salesperson_customer_month + dim_customer +
settings (grup SPV & target) — hanya tabel cache (aturan emas).
"""
import io
from collections import defaultdict
from openpyxl import Workbook
from openpyxl.utils import get_column_letter

import settings_store
from reports import formatting as F

MONTH_ABBR = {1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "Mei", 6: "Jun",
              7: "Jul", 8: "Agu", 9: "Sep", 10: "Okt", 11: "Nov", 12: "Des"}


def _period_months(dari, sampai):
    """['2026-01',...] inklusif. dari/sampai = 'YYYY-MM'."""
    y0, m0 = int(dari[:4]), int(dari[5:7]); y1, m1 = int(sampai[:4]), int(sampai[5:7])
    out = []
    y, m = y0, m0
    while (y, m) <= (y1, m1):
        out.append((y, m))
        m += 1
        if m > 12: m = 1; y += 1
    return out


def _mlabel(y, m):
    return f"{y}-{m:02d} {MONTH_ABBR.get(m, m)}"


def build(db, dari, sampai, channels=None, coverage_warnings=None):
    months = _period_months(dari, sampai)
    monthset = set(months)
    years = sorted({y for y, _ in months})
    chan_set = set(channels) if channels else None

    # --- fetch cache ---
    rows = db.table("agg_salesperson_customer_month").select(
        "slp_name,customer_code,tahun,bulan,channel,revenue,bills").in_("tahun", years).limit(1000000).execute().data or []
    names = {r["customer_code"]: r.get("customer_name") or r["customer_code"]
             for r in (db.table("dim_customer").select("customer_code,customer_name").limit(1000000).execute().data or [])}

    gyear = max(years)
    gmap = settings_store.get_group_map(gyear); reg = settings_store.get_registry(gyear)
    tmap = settings_store.get_target_map(gyear)

    # --- agregasi dalam periode ---
    detail = defaultdict(lambda: defaultdict(float))   # (slp,cust) -> ym -> rev
    sp_rev = defaultdict(float); sp_bills = defaultdict(int); sp_cust = defaultdict(set)
    for r in rows:
        y, m = int(r["tahun"]), int(r["bulan"])
        if (y, m) not in monthset:
            continue
        if chan_set and r.get("channel") not in chan_set:
            continue
        slp = r["slp_name"]; cust = r["customer_code"]; rev = float(r.get("revenue") or 0)
        detail[(slp, cust)][(y, m)] += rev
        sp_rev[slp] += rev; sp_bills[slp] += int(r.get("bills") or 0); sp_cust[slp].add(cust)

    wb = Workbook()

    # ===== Sheet 1: Ringkasan SP =====
    ws = wb.active; ws.title = "Ringkasan SP"
    filt = {"Channel": ", ".join(channels) if channels else "Semua"}
    start = F.write_standard_header(ws, "Salesperson Performance — Ringkasan", dari, sampai, filt, coverage_warnings)
    head = ["Salesperson", "Grup SPV", "Revenue", "Target", "% Achieve", "Gap", "Bills", "AOV", "Jumlah Customer"]
    hrow = start
    for j, h in enumerate(head, 1):
        ws.cell(hrow, j, h)
    F.style_table_header(ws, hrow, len(head))

    summ = []
    for slp in sp_rev:
        spv = settings_store.effective_group(slp, gmap, reg)
        target = settings_store.effective_target(slp, tmap)
        rev = sp_rev[slp]; bills = sp_bills[slp]
        pct = (rev / target) if target else None
        summ.append({"slp": slp, "spv": spv, "rev": rev, "target": target,
                     "pct": pct, "gap": (target - rev) if target else None,
                     "bills": bills, "aov": (rev / bills) if bills else 0,
                     "ncust": len(sp_cust[slp])})
    # urut dari % Achieve terendah (None di akhir)
    summ.sort(key=lambda x: (x["pct"] is None, x["pct"] if x["pct"] is not None else 0))

    r = hrow + 1
    for s in summ:
        ws.cell(r, 1, s["slp"]); ws.cell(r, 2, s["spv"])
        F.rupiah(ws.cell(r, 3, round(s["rev"])))
        F.rupiah(ws.cell(r, 4, round(s["target"])))
        pc = ws.cell(r, 5, s["pct"]);
        if s["pct"] is not None:
            F.persen(pc); fill = F.pct_fill(s["pct"])
            if fill: pc.fill = fill
        else:
            pc.value = "n/a"
        F.rupiah(ws.cell(r, 6, round(s["gap"]) if s["gap"] is not None else ""))
        ws.cell(r, 7, s["bills"]); F.rupiah(ws.cell(r, 8, round(s["aov"])))
        ws.cell(r, 9, s["ncust"])
        r += 1
    # baris total
    tot_rev = sum(s["rev"] for s in summ); tot_tgt = sum(s["target"] for s in summ)
    tot_bills = sum(s["bills"] for s in summ)
    ws.cell(r, 1, "TOTAL").font = F.BOLD
    F.rupiah(ws.cell(r, 3, round(tot_rev))); F.rupiah(ws.cell(r, 4, round(tot_tgt)))
    tp = ws.cell(r, 5, (tot_rev / tot_tgt) if tot_tgt else "n/a")
    if tot_tgt: F.persen(tp)
    F.rupiah(ws.cell(r, 6, round(tot_tgt - tot_rev)))
    ws.cell(r, 7, tot_bills)
    for c in ws[r]: c.font = F.BOLD
    ws.auto_filter.ref = f"A{hrow}:{get_column_letter(len(head))}{r-1}"
    ws.freeze_panes = f"A{hrow+1}"
    for col, w in zip("ABCDEFGHI", [22, 16, 16, 16, 11, 16, 9, 12, 14]):
        ws.column_dimensions[col].width = w

    # ===== Sheet 2: Detail SP x Customer (lebar) =====
    ws2 = wb.create_sheet("Detail SP x Customer")
    start2 = F.write_standard_header(ws2, "Detail Salesperson × Customer × Bulan", dari, sampai, filt, coverage_warnings)
    head2 = ["Salesperson", "Grup SPV", "Customer"] + [_mlabel(y, m) for y, m in months] + ["Total"]
    hrow2 = start2
    for j, h in enumerate(head2, 1):
        ws2.cell(hrow2, j, h)
    F.style_table_header(ws2, hrow2, len(head2))
    r = hrow2 + 1
    for (slp, cust), mm in sorted(detail.items(), key=lambda kv: (kv[0][0], -sum(kv[1].values()))):
        spv = settings_store.effective_group(slp, gmap, reg)
        ws2.cell(r, 1, slp); ws2.cell(r, 2, spv)
        ws2.cell(r, 3, f"{cust} — {names.get(cust, cust)}")
        for j, (y, m) in enumerate(months, 4):
            F.rupiah(ws2.cell(r, j, round(mm.get((y, m), 0))))
        F.rupiah(ws2.cell(r, 3 + len(months) + 1, round(sum(mm.values()))))
        r += 1
    ncol2 = len(head2)
    ws2.auto_filter.ref = f"A{hrow2}:{get_column_letter(ncol2)}{r-1}"
    ws2.freeze_panes = f"D{hrow2+1}"
    for col, w in zip("ABC", [22, 16, 30]):
        ws2.column_dimensions[col].width = w

    bio = io.BytesIO(); wb.save(bio); bio.seek(0)
    return bio.getvalue()
