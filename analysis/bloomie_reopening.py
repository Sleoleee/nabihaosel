"""
Analisis BLOOMIE pasca-reopening (one-off, TERPISAH dari dashboard).

Membandingkan perilaku customer BLOOMIE SEBELUM vs SESUDAH tanggal reopening
(default 2026-07-19), memakai definisi metrik yang SAMA dengan dashboard:
  Revenue = New_Row_Total ; identitas = Customer/Vendor_Code ;
  bills = COUNT DISTINCT Document Number ; AOV = revenue/bills ;
  kategori = kolom Kategori ; channel BLOOMIE = branch mengandung 'BLOOMIE'.

Output: file Excel 3 sheet, DITARUH DI LUAR repo (default ~/Bloomie_Analysis/).

Jalankan dari root repo (butuh backend/.env berisi SUPABASE_URL & SUPABASE_SERVICE_KEY):
    python analysis/bloomie_reopening.py
    python analysis/bloomie_reopening.py --reopen 2026-07-19 --out "D:/Analisis"
"""
import os, sys, argparse
from collections import defaultdict
from datetime import date, datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(os.path.dirname(_HERE), "backend")
sys.path.insert(0, _BACKEND)
from dotenv import load_dotenv
load_dotenv(os.path.join(_BACKEND, ".env"))

import config                       # definisi dashboard (branch_group, REVENUE_COLUMN)
from utils.db import get_client
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

REV = config.REVENUE_COLUMN         # 'new_row_total'


def _d(v):
    if v is None:
        return None
    if isinstance(v, (date, datetime)):
        return v.date() if isinstance(v, datetime) else v
    try:
        return datetime.fromisoformat(str(v)[:10]).date()
    except Exception:
        return None


def fetch_bloomie(db):
    """Ambil semua transaksi channel BLOOMIE via keyset id (kecil, aman)."""
    cols = "id,customer_code,customer_name,document_number,posting_date,kategori,quantity,unit,%s,branch,slp_name" % REV
    rows, last = [], 0
    while True:
        batch = (db.table("transactions").select(cols)
                 .ilike("branch", "%BLOOMIE%").gt("id", last).order("id")
                 .limit(5000).execute().data)
        if not batch:
            break
        for r in batch:
            # pastikan benar channel BLOOMIE lewat aturan dashboard
            if config.branch_group(r.get("branch")) == "BLOOMIE":
                rows.append(r)
        last = batch[-1]["id"]
        if len(batch) < 5000:
            break
    return rows


def metrics(rows):
    """Metrik agregat untuk sekumpulan baris."""
    rev = sum(float(r.get(REV) or 0) for r in rows)
    bills = len({r.get("document_number") for r in rows if r.get("document_number") is not None})
    custs = len({r.get("customer_code") for r in rows if r.get("customer_code")})
    kat = defaultdict(float)
    for r in rows:
        kat[r.get("kategori") or "—"] += float(r.get(REV) or 0)
    top_kat = sorted(kat.items(), key=lambda x: -x[1])[:10]
    return {"revenue": rev, "bills": bills, "customers": custs,
            "aov": rev / bills if bills else 0,
            "rev_per_cust": rev / custs if custs else 0,
            "top_kat": top_kat}


def per_customer(rows):
    """{code: {rev,bills(set docs),first,last,name,kat(set)}}"""
    c = defaultdict(lambda: {"rev": 0.0, "docs": set(), "first": None, "last": None,
                             "name": None, "kat": defaultdict(float)})
    for r in rows:
        code = r.get("customer_code")
        if not code:
            continue
        e = c[code]; e["name"] = e["name"] or r.get("customer_name")
        e["rev"] += float(r.get(REV) or 0)
        if r.get("document_number") is not None:
            e["docs"].add(r.get("document_number"))
        d = _d(r.get("posting_date"))
        if d:
            e["first"] = d if e["first"] is None else min(e["first"], d)
            e["last"] = d if e["last"] is None else max(e["last"], d)
        e["kat"][r.get("kategori") or "—"] += float(r.get(REV) or 0)
    return c


# ----------------- penulisan Excel -----------------
HDR = Font(bold=True, color="FFFFFF"); FILL = PatternFill("solid", fgColor="D31137")
BOLD = Font(bold=True)


def _row(ws, vals, header=False):
    ws.append(vals)
    if header:
        for cell in ws[ws.max_row]:
            cell.font = HDR; cell.fill = FILL
def rupiah(v): return round(float(v or 0))


def build_excel(rows, reopen, out_path):
    before = [r for r in rows if (_d(r.get("posting_date")) and _d(r.get("posting_date")) < reopen)]
    after = [r for r in rows if (_d(r.get("posting_date")) and _d(r.get("posting_date")) >= reopen)]
    mb, ma = metrics(before), metrics(after)

    wb = openpyxl.Workbook()

    # ---- Sheet 1: Perbandingan periode (makro) ----
    ws = wb.active; ws.title = "1-Makro"
    _row(ws, ["BLOOMIE — Perbandingan Sebelum vs Sesudah Reopening"], header=True)
    ws.append([f"Reopening: {reopen.isoformat()} | Sebelum: s/d {(reopen).isoformat()} (eksklusif) | Sesudah: {reopen.isoformat()} dst"])
    ws.append([])
    _row(ws, ["Metrik", "Sebelum", "Sesudah", "Perubahan %"], header=True)
    def chg(a, b): return f"{(b-a)/a*100:+.1f}%" if a else "—"
    ws.append(["Revenue", rupiah(mb["revenue"]), rupiah(ma["revenue"]), chg(mb["revenue"], ma["revenue"])])
    ws.append(["Bills (nota)", mb["bills"], ma["bills"], chg(mb["bills"], ma["bills"])])
    ws.append(["Customer unik", mb["customers"], ma["customers"], chg(mb["customers"], ma["customers"])])
    ws.append(["AOV", rupiah(mb["aov"]), rupiah(ma["aov"]), chg(mb["aov"], ma["aov"])])
    ws.append(["Revenue / customer", rupiah(mb["rev_per_cust"]), rupiah(ma["rev_per_cust"]), chg(mb["rev_per_cust"], ma["rev_per_cust"])])
    ws.append([])
    _row(ws, ["Top kategori SEBELUM", "Revenue", "", "Top kategori SESUDAH", "Revenue"], header=True)
    for i in range(max(len(mb["top_kat"]), len(ma["top_kat"]))):
        b = mb["top_kat"][i] if i < len(mb["top_kat"]) else ("", 0)
        a = ma["top_kat"][i] if i < len(ma["top_kat"]) else ("", 0)
        ws.append([b[0], rupiah(b[1]), "", a[0], rupiah(a[1])])

    # ---- Sheet 2: Same-customer (beli di kedua periode) ----
    ws2 = wb.create_sheet("2-SameCustomer")
    cb, ca = per_customer(before), per_customer(after)
    both = sorted(set(cb) & set(ca), key=lambda c: -(ca[c]["rev"]))
    _row(ws2, ["Customer yang beli di KEDUA periode (perubahan perilaku orang yang sama)"], header=True)
    ws2.append([f"Jumlah customer kedua periode: {len(both)}"])
    ws2.append([])
    # ringkasan agregat same-customer
    def agg(cdict, codes):
        rev = sum(cdict[c]["rev"] for c in codes); bills = sum(len(cdict[c]["docs"]) for c in codes)
        return rev, bills, (rev / bills if bills else 0)
    rb, bb, ab = agg(cb, both); ra, ba_, aa = agg(ca, both)
    _row(ws2, ["Metrik (hanya same-customer)", "Sebelum", "Sesudah", "Perubahan %"], header=True)
    ws2.append(["Revenue", rupiah(rb), rupiah(ra), chg(rb, ra)])
    ws2.append(["Bills", bb, ba_, chg(bb, ba_)])
    ws2.append(["AOV", rupiah(ab), rupiah(aa), chg(ab, aa)])
    ws2.append([])
    _row(ws2, ["Customer", "Rev sebelum", "Bills sblm", "Rev sesudah", "Bills ssdh", "Δ Rev %", "Kategori utama ssdh"], header=True)
    for c in both:
        topk = max(ca[c]["kat"].items(), key=lambda x: x[1])[0] if ca[c]["kat"] else "—"
        ws2.append([ca[c]["name"] or c, rupiah(cb[c]["rev"]), len(cb[c]["docs"]),
                    rupiah(ca[c]["rev"]), len(ca[c]["docs"]), chg(cb[c]["rev"], ca[c]["rev"]), topk])

    # ---- Sheet 3: Retensi pembeli BARU pasca-reopening ----
    ws3 = wb.create_sheet("3-RetensiBaru")
    call = per_customer(rows)   # lintas seluruh periode -> tahu first-ever
    new_codes = [c for c in call if call[c]["first"] and call[c]["first"] >= reopen]
    # jumlah nota pasca reopening per customer baru
    after_docs = defaultdict(set)
    for r in after:
        if r.get("customer_code") in set(new_codes) and r.get("document_number") is not None:
            after_docs[r.get("customer_code")].add(r.get("document_number"))
    once = sum(1 for c in new_codes if len(after_docs[c]) <= 1)
    repeat = sum(1 for c in new_codes if len(after_docs[c]) >= 2)
    n = len(new_codes)
    _row(ws3, ["Retensi pembeli BARU pasca-reopening (pertama kali beli >= reopening)"], header=True)
    ws3.append([f"Observasi pendek (reopening {reopen.isoformat()} s/d data terakhir) — indikatif, belum final."])
    ws3.append([])
    _row(ws3, ["Metrik", "Nilai"], header=True)
    ws3.append(["Pembeli baru pasca-reopening", n])
    ws3.append(["Hanya beli 1x (one-time)", f"{once}  ({once/n*100:.1f}%)" if n else "—"])
    ws3.append(["Beli ulang (>=2x)", f"{repeat}  ({repeat/n*100:.1f}%)" if n else "—"])
    ws3.append([])
    _row(ws3, ["Customer baru", "Tgl pertama", "Jumlah nota pasca", "Revenue pasca", "Status"], header=True)
    for c in sorted(new_codes, key=lambda c: -call[c]["rev"]):
        nb = len(after_docs[c])
        ws3.append([call[c]["name"] or c, call[c]["first"].isoformat(), nb,
                    rupiah(sum(float(r.get(REV) or 0) for r in after if r.get("customer_code") == c)),
                    "beli ulang" if nb >= 2 else "sekali beli"])

    # lebar kolom enak dibaca
    for ws_ in wb.worksheets:
        for col in ws_.columns:
            w = max((len(str(c.value)) for c in col if c.value is not None), default=10)
            ws_.column_dimensions[col[0].column_letter].width = min(42, max(12, w + 2))

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    wb.save(out_path)
    return len(rows), len(before), len(after), n, once, repeat


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reopen", default="2026-07-19")
    ap.add_argument("--out", default=os.path.join(os.path.expanduser("~"), "Bloomie_Analysis"))
    args = ap.parse_args()
    reopen = datetime.fromisoformat(args.reopen).date()

    print("Mengambil transaksi BLOOMIE dari Supabase...")
    db = get_client()
    rows = fetch_bloomie(db)
    print(f"  {len(rows)} baris BLOOMIE.")
    if not rows:
        print("Tidak ada data BLOOMIE. Berhenti."); return

    out_file = os.path.join(args.out, f"bloomie_reopening_{reopen.isoformat()}.xlsx")
    total, nb, na, newc, once, rep = build_excel(rows, reopen, out_file)
    print(f"\nSebelum: {nb} baris | Sesudah: {na} baris")
    print(f"Pembeli baru pasca-reopening: {newc} (sekali beli {once}, ulang {rep})")
    print(f"\n✓ Excel tersimpan di: {out_file}")


if __name__ == "__main__":
    main()
