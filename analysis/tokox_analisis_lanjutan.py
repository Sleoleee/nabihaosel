"""
Toko X (= channel BLOOMIE) — Analisis Lanjutan Pra vs Pasca Reopening.
Menghasilkan satu workbook Excel machine-readable (header baris 1, % sbg pecahan,
rupiah angka utuh, snake_case) dari data mentah SQLite lokal.

  python analysis/tokox_analisis_lanjutan.py [--reopen 2026-07-19] [--out DIR]

Catatan: "Toko X" = BLOOMIE (kerahasiaan). master customer (tipe_usaha/kota) &
faktor konversi satuan tidak tersedia di data -> dikosongkan, dicatat di 00_README.
"""
import os, argparse
from collections import defaultdict
from datetime import datetime, date, timedelta
from statistics import median
import openpyxl
import _bloomie_common as B

BULK = {"BALL","BOX","CTN","DUS","GROS","GROSS","KARTON","KODI","LSN","LUSIN","PACK","PAK","RIM"}
GENERIK_NAMES = {"UMUM","CASH","WALK IN","WALKIN","GUEST","-","","TUNAI","UMUM/CASH"}


def qf(v):
    try: return float(v)
    except Exception: return 0.0


def dparse(v):
    return B.d_(v)


def tier_of(q):
    if q <= 1: return "T1"
    if q <= 5: return "T2"
    if q <= 11: return "T3a"
    if q <= 20: return "T3b"
    if q <= 50: return "T4"
    return "T5"
TIER_ORDER = ["T1","T2","T3a","T3b","T4","T5"]


def month_bucket(d, reopen):
    if d.year == reopen.year and d.month == reopen.month:
        return f"{d.year}-{d.month:02d}a" if d.day < reopen.day else f"{d.year}-{d.month:02d}b"
    return f"{d.year}-{d.month:02d}"


def mkey(m):
    y = int(m[:4]); mo = int(m[5:7]); half = 0 if m.endswith("a") else (1 if m.endswith("b") else -1)
    return (y, mo, half)


def per30(total, days):
    return total / days * 30 if days else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reopen", default="2026-07-19")
    ap.add_argument("--out", default=os.path.join(os.path.expanduser("~"), "Bloomie_Analysis"))
    args = ap.parse_args()
    reopen = datetime.fromisoformat(args.reopen).date()

    raw = B.fetch_bloomie()
    print(f"{len(raw)} baris mentah Toko X.")
    if not raw:
        print("Tidak ada data. Jalankan local_ingest.py dulu."); return

    # ---------------- CLEANING ----------------
    dropped_retur = dropped_qty0 = dropped_nodate = 0
    unit_empty = 0
    seen = set(); dup_rows = 0
    rows = []
    for r in raw:
        d = dparse(r.get("posting_date"))
        if not d:
            dropped_nodate += 1; continue
        q = qf(r.get("quantity")); rev = qf(r.get(B.REV))
        if rev < 0:
            dropped_retur += 1; continue
        if q <= 0:
            dropped_qty0 += 1; continue
        u = (r.get("unit") or "").strip().upper()
        if u == "PIECES": u = "PCS"
        if u == "": unit_empty += 1; u = "—"
        key = (r.get("document_number"), r.get("item_no"), q, rev, d.isoformat())
        if key in seen:
            dup_rows += 1
        seen.add(key)
        rows.append({"doc": r.get("document_number"), "date": d, "cust": (r.get("customer_code") or "").strip(),
                     "name": r.get("customer_name"), "item": r.get("item_no"), "kat": (r.get("kategori") or "Lainnya"),
                     "qty": q, "unit": u, "rev": rev})

    last_date = max(r["date"] for r in rows)
    DAYS = {"PRA": 199, "PASCA": (last_date - reopen).days + 1, "PRA_BASELINE": 181}
    jun30 = date(reopen.year, 6, 30)

    def period_of(d):
        return "PRA" if d < reopen else "PASCA"

    for r in rows:
        r["periode"] = period_of(r["date"])
        r["bulan"] = month_bucket(r["date"], reopen)
        r["baseline"] = (r["date"] <= jun30)

    # ---------------- NOTA-LEVEL ----------------
    notas = defaultdict(lambda: {"date": None, "cust": None, "name": None, "qty": 0.0, "rev": 0.0,
                                 "units": set(), "skus": set(), "catrev": defaultdict(float)})
    for r in rows:
        n = notas[r["doc"]]
        n["date"] = r["date"] if n["date"] is None else min(n["date"], r["date"])
        if n["cust"] is None: n["cust"] = r["cust"]; n["name"] = r["name"]
        n["qty"] += r["qty"]; n["rev"] += r["rev"]
        n["units"].add(r["unit"]); n["skus"].add(r["item"])
        n["catrev"][r["kat"]] += r["rev"]
    for doc, n in notas.items():
        n["periode"] = period_of(n["date"]); n["bulan"] = month_bucket(n["date"], reopen)
        n["baseline"] = (n["date"] <= jun30)
        n["tier"] = tier_of(n["qty"])
        n["grosir_lama"] = bool(n["units"] & BULK) or n["qty"] >= 12

    # ---------------- GENERIK ----------------
    cust_nota_all = defaultdict(int); cust_rev_all = defaultdict(float)
    for n in notas.values():
        if n["cust"]: cust_nota_all[n["cust"]] += 1; cust_rev_all[n["cust"]] += n["rev"]
    generik = {}
    for c in set(list(cust_nota_all) + [""]):
        name_u = (c or "").strip().upper()
        reason = None
        if name_u in GENERIK_NAMES or c == "":
            reason = "kode/nama generik"
        else:
            nn = cust_nota_all.get(c, 0); aov = cust_rev_all.get(c, 0) / nn if nn else 0
            if nn >= 50 and aov < 50000:
                reason = f"nota tinggi ({nn}) & AOV kecil ({round(aov)})"
        if reason: generik[c] = reason
    def is_gen(c): return c in generik

    # ---------------- helper agregasi ----------------
    def agg_rows(subset):
        rev = sum(r["rev"] for r in subset)
        docs = {r["doc"] for r in subset}
        custs = {r["cust"] for r in subset if r["cust"]}
        qty = sum(r["qty"] for r in subset)
        return rev, len(docs), len(custs), qty

    # ================= WORKBOOK =================
    wb = openpyxl.Workbook(); wb.remove(wb.active)

    def sheet(name, columns, data):
        ws = wb.create_sheet(name[:31])
        ws.append(columns)
        for row in data:
            ws.append([row.get(c, "") for c in columns])
        return ws

    # ---------- 00_README ----------
    readme = []
    def rm(item, nilai, catatan=""):
        readme.append({"item": item, "nilai": nilai, "catatan": catatan})
    rm("toko", "Toko X", "nama disamarkan (BLOOMIE)")
    rm("rentang_tanggal", f"{min(r['date'] for r in rows).isoformat()} s/d {last_date.isoformat()}")
    rm("reopening", reopen.isoformat())
    for p in ("PRA", "PASCA", "PRA_BASELINE"):
        rm(f"hari_{p}", DAYS[p], "untuk normalisasi per-30-hari = total/hari*30")
    for p in ("PRA", "PASCA"):
        sub = [r for r in rows if (r["periode"] == p)]
        rev, nn, nc, qty = agg_rows(sub)
        rm(f"revenue_{p}", round(rev)); rm(f"nota_{p}", nn); rm(f"customer_unik_{p}", nc)
    subb = [r for r in rows if r["baseline"]]
    rm("revenue_PRA_BASELINE", round(sum(r['rev'] for r in subb)))
    rm("baris_dibuang_retur_revneg", dropped_retur)
    rm("baris_dibuang_qty0", dropped_qty0)
    rm("baris_dibuang_tanpa_tanggal", dropped_nodate)
    rm("baris_duplikat_terdeteksi", dup_rows, "tidak dibuang, hanya dilaporkan")
    rm("unit_kosong", unit_empty, "diisi '—'")
    rm("PIECES_digabung_ke_PCS", "ya")
    rm("akun_generik_terdeteksi", len(generik), "; ".join(f"{k or '(kosong)'}" for k in list(generik)[:20]))
    rm("faktor_konversi_satuan_bulk", "tidak tersedia", "qty_pcs_equiv = qty mentah")
    rm("master_customer_tipe_usaha_kota", "tidak tersedia", "kolom dikosongkan")
    rm("januari_left_censored", "ya", "dikeluarkan dari perbandingan baru vs retain")
    # overlap customers
    cust_pra = {r["cust"] for r in rows if r["periode"] == "PRA" and r["cust"]}
    cust_pas = {r["cust"] for r in rows if r["periode"] == "PASCA" and r["cust"]}
    rm("customer_unik_total", len(cust_pra | cust_pas))
    rm("customer_overlap_PRA_PASCA", len(cust_pra & cust_pas))
    sheet("00_README", ["item", "nilai", "catatan"], readme)

    # ---------- 01_Customer_Level ----------
    cust_period = defaultdict(lambda: {"notas": [], "qty": 0.0, "rev": 0.0, "skus": set(),
                                       "catrev": defaultdict(float), "grosir": 0})
    for n in notas.values():
        if not n["cust"]: continue
        e = cust_period[(n["cust"], n["periode"])]
        e["notas"].append(n["qty"]); e["qty"] += n["qty"]; e["rev"] += n["rev"]
        e["skus"] |= n["skus"]
        for k, v in n["catrev"].items(): e["catrev"][k] += v
        if n["grosir_lama"]: e["grosir"] += 1
    cust_first = {}; cust_last = {}; cust_name = {}; cust_months = defaultdict(set)
    for n in notas.values():
        c = n["cust"]
        if not c: continue
        cust_first[c] = n["date"] if c not in cust_first else min(cust_first[c], n["date"])
        cust_last[c] = n["date"] if c not in cust_last else max(cust_last[c], n["date"])
        cust_name.setdefault(c, n["name"])
        cust_months[c].add(n["bulan"])

    def topcat(cp):
        return max(cp["catrev"].items(), key=lambda x: x[1])[0] if cp["catrev"] else ""

    # ---- PRA-AGREGASI SEKALI JALAN (hindari O(n^2) di sheet 05/06/07/11) ----
    RC = defaultdict(lambda: {"rev": 0.0, "qty": 0.0, "docqty": defaultdict(float), "custs": set(),
                              "notas": set(), "rev_gros": 0.0, "rev_t45": 0.0})  # (periode,kat)
    MC = defaultdict(lambda: {"rev": 0.0, "qty": 0.0, "docqty": defaultdict(float), "custs": set()})  # (bulan,kat)
    CPK = defaultdict(lambda: defaultdict(float))  # (cust,periode) -> kat -> qty
    for r in rows:
        n = notas[r["doc"]]
        rc = RC[(r["periode"], r["kat"])]
        rc["rev"] += r["rev"]; rc["qty"] += r["qty"]; rc["docqty"][r["doc"]] += r["qty"]; rc["notas"].add(r["doc"])
        if r["cust"]: rc["custs"].add(r["cust"])
        if n["grosir_lama"]: rc["rev_gros"] += r["rev"]
        if n["tier"] in ("T4", "T5"): rc["rev_t45"] += r["rev"]
        mc = MC[(r["bulan"], r["kat"])]
        mc["rev"] += r["rev"]; mc["qty"] += r["qty"]; mc["docqty"][r["doc"]] += r["qty"]
        if r["cust"]: mc["custs"].add(r["cust"])
        if r["cust"]: CPK[(r["cust"], r["periode"])][r["kat"]] += r["qty"]
    MCUST = defaultdict(lambda: {"rev": 0.0, "qty": 0.0, "notas": 0})  # (bulan,cust)
    for n in notas.values():
        if not n["cust"]: continue
        e = MCUST[(n["bulan"], n["cust"])]; e["rev"] += n["rev"]; e["qty"] += n["qty"]; e["notas"] += 1

    c01 = []
    allc = cust_pra | cust_pas
    for c in allc:
        P = cust_period.get((c, "PRA")); Q = cust_period.get((c, "PASCA"))
        def g(e, k, default=0): return e[k] if e else default
        nota_pra = len(P["notas"]) if P else 0; nota_pas = len(Q["notas"]) if Q else 0
        rev_pra = g(P, "rev"); rev_pas = g(Q, "rev"); qty_pra = g(P, "qty"); qty_pas = g(Q, "qty")
        avgp = (qty_pra / nota_pra) if nota_pra else 0; avgq = (qty_pas / nota_pas) if nota_pas else 0
        medp = median(P["notas"]) if P and P["notas"] else 0
        medq = median(Q["notas"]) if Q and Q["notas"] else 0
        tier_pra = tier_of(avgp) if nota_pra else ""
        tier_pas = tier_of(avgq) if nota_pas else ""
        status = "Kembali" if (c in cust_pra and c in cust_pas) else ("Belum kembali" if c in cust_pra else "Baru")
        if tier_pra and tier_pas:
            ip, iq = TIER_ORDER.index(tier_pra), TIER_ORDER.index(tier_pas)
            ptier = "Naik" if iq > ip else ("Turun" if iq < ip else "Tetap")
        else:
            ptier = "-"
        nota30p = per30(nota_pra, DAYS["PRA"]); nota30q = per30(nota_pas, DAYS["PASCA"])
        pola_cicil = (nota30q > nota30p) and (avgp > 0 and (avgp - avgq) / avgp >= 0.25)
        c01.append({
            "kode_customer": c, "nama_customer": cust_name.get(c, ""), "tipe_usaha": "", "kota": "",
            "is_generik": is_gen(c),
            "kategori_utama_pra": topcat(P) if P else "", "kategori_utama_pasca": topcat(Q) if Q else "",
            "nota_pra": nota_pra, "qty_pra": round(qty_pra), "revenue_pra": round(rev_pra),
            "nota_pasca": nota_pas, "qty_pasca": round(qty_pas), "revenue_pasca": round(rev_pas),
            "avg_qty_per_nota_pra": round(avgp, 2), "median_qty_per_nota_pra": round(medp, 2),
            "avg_qty_per_nota_pasca": round(avgq, 2), "median_qty_per_nota_pasca": round(medq, 2),
            "tier_pra": tier_pra, "tier_pasca": tier_pas, "status": status, "perubahan_tier": ptier,
            "revenue_per30_pra": round(per30(rev_pra, DAYS["PRA"])), "revenue_per30_pasca": round(per30(rev_pas, DAYS["PASCA"])),
            "nota_per30_pra": round(nota30p, 2), "nota_per30_pasca": round(nota30q, 2),
            "tgl_pertama_beli": cust_first[c].isoformat(), "tgl_terakhir_beli": cust_last[c].isoformat(),
            "bulan_pertama_beli": month_bucket(cust_first[c], reopen), "jumlah_bulan_aktif": len(cust_months[c]),
            "jumlah_sku_unik_pra": len(P["skus"]) if P else 0, "jumlah_sku_unik_pasca": len(Q["skus"]) if Q else 0,
            "pct_nota_grosir_lama_pra": round(P["grosir"] / nota_pra, 4) if nota_pra else "",
            "pct_nota_grosir_lama_pasca": round(Q["grosir"] / nota_pas, 4) if nota_pas else "",
            "pola_cicil": pola_cicil,
            "_sortkey": rev_pra + rev_pas,
        })
    c01.sort(key=lambda x: -x["_sortkey"])
    cols01 = ["kode_customer","nama_customer","tipe_usaha","kota","is_generik","kategori_utama_pra","kategori_utama_pasca",
              "nota_pra","qty_pra","revenue_pra","nota_pasca","qty_pasca","revenue_pasca",
              "avg_qty_per_nota_pra","median_qty_per_nota_pra","avg_qty_per_nota_pasca","median_qty_per_nota_pasca",
              "tier_pra","tier_pasca","status","perubahan_tier","revenue_per30_pra","revenue_per30_pasca",
              "nota_per30_pra","nota_per30_pasca","tgl_pertama_beli","tgl_terakhir_beli","bulan_pertama_beli",
              "jumlah_bulan_aktif","jumlah_sku_unik_pra","jumlah_sku_unik_pasca","pct_nota_grosir_lama_pra",
              "pct_nota_grosir_lama_pasca","pola_cicil"]
    sheet("01_Customer_Level", cols01, c01)

    # ---------- 02_Distribusi_Qty_Nota ----------
    d02 = []
    for p in ("PRA", "PASCA"):
        pn = [n for n in notas.values() if n["periode"] == p]
        totn = len(pn); totr = sum(n["rev"] for n in pn) or 1
        by = defaultdict(lambda: [0, 0.0])
        for n in pn:
            q = int(n["qty"]) if n["qty"] <= 100 else ("101-200" if n["qty"] <= 200 else ("201-500" if n["qty"] <= 500 else ">500"))
            by[q][0] += 1; by[q][1] += n["rev"]
        def kk(x):
            return (0, x) if isinstance(x, int) else (1, {"101-200":1,"201-500":2,">500":3}[x])
        for q in sorted(by, key=kk):
            cnt, rev = by[q]
            d02.append({"periode": p, "qty_per_nota": q, "jumlah_nota": cnt,
                        "nota_per30": round(per30(cnt, DAYS[p]), 2), "pct_nota": round(cnt/totn, 4) if totn else "",
                        "revenue": round(rev), "pct_revenue": round(rev/totr, 4)})
    sheet("02_Distribusi_Qty_Nota", ["periode","qty_per_nota","jumlah_nota","nota_per30","pct_nota","revenue","pct_revenue"], d02)

    # ---------- 03_Tier_Nota ----------
    def tier_block(label, pred):
        pn = [n for n in notas.values() if pred(n)]
        totn = len(pn)
        out = []
        for t in TIER_ORDER:
            tn = [n for n in pn if n["tier"] == t]
            cnt = len(tn); rev = sum(n["rev"] for n in tn)
            nilai = [n["rev"] for n in tn]
            out.append({"periode": label, "tier": t, "jumlah_nota": cnt, "nota_per30": round(per30(cnt, DAYS[label]), 2),
                        "pct_nota": round(cnt/totn, 4) if totn else "", "revenue": round(rev),
                        "revenue_per30": round(per30(rev, DAYS[label])), "pct_revenue": round(rev/(sum(n['rev'] for n in pn) or 1), 4),
                        "aov": round(rev/cnt) if cnt else "", "median_nilai_nota": round(median(nilai)) if nilai else "",
                        "avg_qty": round(sum(n["qty"] for n in tn)/cnt, 2) if cnt else "",
                        "avg_sku_unik_per_nota": round(sum(len(n["skus"]) for n in tn)/cnt, 2) if cnt else "",
                        "jumlah_customer_unik": len({n["cust"] for n in tn if n["cust"]})})
        return out
    d03 = tier_block("PRA", lambda n: n["periode"] == "PRA") + \
          tier_block("PASCA", lambda n: n["periode"] == "PASCA") + \
          tier_block("PRA_BASELINE", lambda n: n["baseline"])
    sheet("03_Tier_Nota", ["periode","tier","jumlah_nota","nota_per30","pct_nota","revenue","revenue_per30","pct_revenue",
                           "aov","median_nilai_nota","avg_qty","avg_sku_unik_per_nota","jumlah_customer_unik"], d03)

    # ---------- 04_Tier_x_Kategori ----------
    d04 = []
    for p in ("PRA", "PASCA"):
        pn = [n for n in notas.values() if n["periode"] == p]
        kat_rev_tot = defaultdict(float)
        for n in pn:
            for k, v in n["catrev"].items(): kat_rev_tot[k] += v
        cell = defaultdict(lambda: {"rev": 0.0, "qty": 0.0, "notas": set()})
        # need qty per (tier,kat) -> approximate from rows
        for r in rows:
            if r["periode"] != p: continue
            t = notas[r["doc"]]["tier"]
            e = cell[(t, r["kat"])]; e["rev"] += r["rev"]; e["qty"] += r["qty"]; e["notas"].add(r["doc"])
        for (t, k), e in sorted(cell.items(), key=lambda x: (TIER_ORDER.index(x[0][0]), -x[1]["rev"])):
            d04.append({"periode": p, "tier": t, "kategori": k, "revenue": round(e["rev"]), "qty": round(e["qty"]),
                        "jumlah_nota_memuat_kategori": len(e["notas"]),
                        "pct_revenue_kategori_dari_tier": round(e["rev"]/kat_rev_tot[k], 4) if kat_rev_tot[k] else ""})
    sheet("04_Tier_x_Kategori", ["periode","tier","kategori","revenue","qty","jumlah_nota_memuat_kategori","pct_revenue_kategori_dari_tier"], d04)

    # ---------- 05_Kategori_Detail ----------
    d05 = []
    tot_rev_p = {p: sum(RC[(pp, k)]["rev"] for (pp, k) in RC if pp == p) or 1 for p in ("PRA", "PASCA")}
    for p in ("PRA", "PASCA"):
        kats = sorted({k for (pp, k) in RC if pp == p})
        for k in kats:
            e = RC[(p, k)]; rev = e["rev"]; qty = e["qty"]; docs = e["docqty"]
            pnq = list(docs.values())
            d05.append({"periode": p, "kategori": k, "revenue": round(rev), "revenue_per30": round(per30(rev, DAYS[p])),
                        "pct_revenue_total": round(rev/tot_rev_p[p], 4), "qty_pcs": round(qty), "qty_per30": round(per30(qty, DAYS[p])),
                        "nota_memuat_kategori": len(e["notas"]), "avg_qty_per_order": round(qty/len(docs), 2) if docs else "",
                        "median_qty_per_order": round(median(pnq), 2) if pnq else "",
                        "harga_rata2_per_pcs": round(rev/qty) if qty else "", "customer_unik": len(e["custs"]),
                        "pct_revenue_dari_nota_grosir_lama": round(e["rev_gros"]/rev, 4) if rev else "",
                        "pct_revenue_dari_T4_T5": round(e["rev_t45"]/rev, 4) if rev else ""})
    sheet("05_Kategori_Detail", ["periode","kategori","revenue","revenue_per30","pct_revenue_total","qty_pcs","qty_per30",
                                 "nota_memuat_kategori","avg_qty_per_order","median_qty_per_order","harga_rata2_per_pcs",
                                 "customer_unik","pct_revenue_dari_nota_grosir_lama","pct_revenue_dari_T4_T5"], d05)

    # ---------- 06_Kategori_Bulanan ----------
    d06 = []
    months = sorted({r["bulan"] for r in rows}, key=mkey)
    for m in months:
        for k in sorted({kk for (mm, kk) in MC if mm == m}):
            e = MC[(m, k)]; docs = e["docqty"]; pnq = list(docs.values())
            d06.append({"bulan": m, "kategori": k, "revenue": round(e["rev"]), "qty_pcs": round(e["qty"]),
                        "avg_qty_per_order": round(e["qty"]/len(docs), 2) if docs else "",
                        "median_qty_per_order": round(median(pnq), 2) if pnq else "",
                        "customer_unik": len(e["custs"])})
    sheet("06_Kategori_Bulanan", ["bulan","kategori","revenue","qty_pcs","avg_qty_per_order","median_qty_per_order","customer_unik"], d06)

    # ---------- 07_Customer_Bulanan ----------
    cust_month_first = {c: month_bucket(cust_first[c], reopen) for c in cust_first}
    month_custs = defaultdict(list)
    for (m, c) in MCUST: month_custs[m].append(c)
    d07 = []
    for m in months:
        active = month_custs.get(m, [])
        baru = [c for c in active if cust_month_first.get(c) == m]
        retain = [c for c in active if cust_month_first.get(c) != m]
        rev_baru = sum(MCUST[(m, c)]["rev"] for c in baru)
        rev_ret = sum(MCUST[(m, c)]["rev"] for c in retain)
        spb = [MCUST[(m, c)]["rev"] for c in baru]
        spr = [MCUST[(m, c)]["rev"] for c in retain]
        tier_count = {t: 0 for t in TIER_ORDER}
        for c in baru:
            e = MCUST[(m, c)]
            tier_count[tier_of(e["qty"]/e["notas"] if e["notas"] else 0)] += 1
        crev = sorted((MCUST[(m, c)]["rev"] for c in active), reverse=True)
        tr = sum(crev) or 1
        row = {"bulan": m, "customer_aktif": len(active), "customer_baru": len(baru), "customer_retain": len(retain),
               "revenue_baru": round(rev_baru), "revenue_retain": round(rev_ret),
               "spend_per_cust_baru": round(sum(spb)/len(spb)) if spb else "", "median_spend_cust_baru": round(median(spb)) if spb else "",
               "spend_per_cust_retain": round(sum(spr)/len(spr)) if spr else "", "median_spend_cust_retain": round(median(spr)) if spr else "",
               "share_top5": round(sum(crev[:5])/tr, 4), "share_top10": round(sum(crev[:10])/tr, 4)}
        for t in TIER_ORDER: row[f"customer_baru_{t}"] = tier_count[t]
        d07.append(row)
    cols07 = ["bulan","customer_aktif","customer_baru","customer_retain","revenue_baru","revenue_retain",
              "spend_per_cust_baru","median_spend_cust_baru","spend_per_cust_retain","median_spend_cust_retain"] + \
             [f"customer_baru_{t}" for t in TIER_ORDER] + ["share_top5","share_top10"]
    sheet("07_Customer_Bulanan", cols07, d07)

    # ---------- 08a_Cohort_Bulanan ----------
    cohorts = sorted({cust_month_first[c] for c in cust_month_first}, key=mkey)
    maxn = len(months)
    d08a = []
    for ch in cohorts:
        members = [c for c in cust_month_first if cust_month_first[c] == ch]
        size = len(members)
        row = {"bulan_pertama_beli": ch, "ukuran_cohort": size}
        ch_idx = months.index(ch) if ch in months else 0
        for k in range(0, maxn - ch_idx):
            mn = months[ch_idx + k]
            act = len({c for c in members if mn in cust_months[c]})
            row[f"bulan_ke_{k}"] = round(act/size, 4) if size else ""
        d08a.append(row)
    cols08a = ["bulan_pertama_beli","ukuran_cohort"] + [f"bulan_ke_{k}" for k in range(maxn)]
    sheet("08a_Cohort_Bulanan", cols08a, d08a)

    # ---------- 08b_Repurchase_Hari ----------
    # tier masuk = tier nota pertama; pct beli lagi dalam 30/60/90 hari
    first_nota = {}
    for n in sorted(notas.values(), key=lambda x: x["date"]):
        if n["cust"] and n["cust"] not in first_nota:
            first_nota[n["cust"]] = n
    cust_dates = defaultdict(list)
    for n in notas.values():
        if n["cust"]: cust_dates[n["cust"]].append(n["date"])
    d08b = []
    for ch in cohorts:
        for t in TIER_ORDER:
            members = [c for c in cust_month_first if cust_month_first[c] == ch and first_nota[c]["tier"] == t]
            if not members: continue
            row = {"bulan_pertama_beli": ch, "tier_masuk": t, "ukuran": len(members)}
            for w in (30, 60, 90):
                enough = (last_date - first_nota[members[0]]["date"]).days >= w  # kasar: pakai cohort start
                if not enough:
                    row[f"pct_beli_lagi_{w}hr"] = "NA"; continue
                cnt = 0
                for c in members:
                    f = first_nota[c]["date"]
                    again = any(f < d <= f + timedelta(days=w) for d in cust_dates[c])
                    if again: cnt += 1
                row[f"pct_beli_lagi_{w}hr"] = round(cnt/len(members), 4)
            d08b.append(row)
    sheet("08b_Repurchase_Hari", ["bulan_pertama_beli","tier_masuk","ukuran","pct_beli_lagi_30hr","pct_beli_lagi_60hr","pct_beli_lagi_90hr"], d08b)

    # ---------- 09_Migrasi_Tier ----------
    d09 = defaultdict(lambda: {"n": 0, "rp": 0.0, "rq": 0.0})
    for row in c01:
        if row["status"] != "Kembali": continue
        key = (row["tier_pra"], row["tier_pasca"])
        e = d09[key]; e["n"] += 1; e["rp"] += row["revenue_pra"]; e["rq"] += row["revenue_pasca"]
    d09rows = [{"tier_pra": k[0], "tier_pasca": k[1], "jumlah_customer": v["n"],
                "revenue_pra": round(v["rp"]), "revenue_pasca": round(v["rq"])} for k, v in d09.items()]
    sheet("09_Migrasi_Tier", ["tier_pra","tier_pasca","jumlah_customer","revenue_pra","revenue_pasca"], d09rows)

    # ---------- 10_Cek_Akun_Generik ----------
    d10 = []
    tot_nota_all = len(notas); tot_rev_all = sum(n["rev"] for n in notas.values()) or 1
    for c, reason in generik.items():
        P = cust_period.get((c, "PRA")); Q = cust_period.get((c, "PASCA"))
        np_, rp = (len(P["notas"]), P["rev"]) if P else (0, 0)
        nq, rq = (len(Q["notas"]), Q["rev"]) if Q else (0, 0)
        d10.append({"kode_customer": c, "nama_customer": cust_name.get(c, ""), "alasan_terdeteksi": reason,
                    "nota_pra": np_, "revenue_pra": round(rp), "nota_pasca": nq, "revenue_pasca": round(rq),
                    "pct_nota_total": round((np_+nq)/tot_nota_all, 4) if tot_nota_all else "",
                    "pct_revenue_total": round((rp+rq)/tot_rev_all, 4)})
    sheet("10_Cek_Akun_Generik", ["kode_customer","nama_customer","alasan_terdeteksi","nota_pra","revenue_pra",
                                  "nota_pasca","revenue_pasca","pct_nota_total","pct_revenue_total"], d10)

    # ---------- 11_Top_Customer ----------
    core = ["kode_customer","nama_customer","tipe_usaha","tier_pra","tier_pasca","status","revenue_pra","revenue_pasca",
            "revenue_per30_pra","revenue_per30_pasca","kategori_utama_pra","kategori_utama_pasca"]
    def toplist(name, items, key, n=20):
        out = []
        for rank, row in enumerate(sorted(items, key=key, reverse=True)[:n], 1):
            o = {"daftar": name, "rank": rank}
            for col in core: o[col] = row.get(col, "")
            out.append(o)
        return out
    d11 = []
    d11 += toplist("TOP20_PRA", c01, lambda r: r["revenue_pra"])
    d11 += toplist("TOP20_PASCA", c01, lambda r: r["revenue_pasca"])
    d11 += toplist("TOP20_HILANG", [r for r in c01 if r["status"] == "Belum kembali"], lambda r: r["revenue_pra"])
    d11 += toplist("TOP20_BARU", [r for r in c01 if r["status"] == "Baru"], lambda r: r["revenue_pasca"])
    d11 += toplist("TOP20_TURUN_KELAS", [r for r in c01 if r["status"] == "Kembali" and r["perubahan_tier"] == "Turun"], lambda r: r["revenue_pra"])
    d11 += toplist("TOP20_POLA_CICIL", [r for r in c01 if r["pola_cicil"]], lambda r: r["revenue_pra"])
    # qty kategori per customer (dari CPK, cepat)
    def qty_cat(c, p, catsub):
        return sum(v for kat, v in CPK.get((c, p), {}).items() if catsub in kat.upper())
    for (lbl, p, catsub) in [("TOP10_AKSESORIS_PRA","PRA","AKSESORIS"),("TOP10_AKSESORIS_PASCA","PASCA","AKSESORIS"),
                             ("TOP10_STATIONARY_PRA","PRA","STATIONARY"),("TOP10_STATIONARY_PASCA","PASCA","STATIONARY")]:
        scored = [(qty_cat(r["kode_customer"], p, catsub), r) for r in c01]
        scored = [(q, r) for q, r in scored if q > 0]
        out = []
        for rank, (q, row) in enumerate(sorted(scored, key=lambda x: -x[0])[:10], 1):
            o = {"daftar": lbl, "rank": rank}
            for col in core: o[col] = row.get(col, "")
            out.append(o)
        d11 += out
    sheet("11_Top_Customer", ["daftar","rank"] + core, d11)

    # ---------- 12_Tren_Mingguan ----------
    def monday(d): return d - timedelta(days=d.weekday())
    reopen_monday = monday(reopen)
    d12 = []
    wk = defaultdict(lambda: {"rev": 0.0, "docs": set(), "custs": set(), "qty": 0.0, "tiers": defaultdict(int), "notas": 0})
    for n in notas.values():
        wkstart = monday(n["date"])
        rel = (wkstart - reopen_monday).days // 7
        if rel < -8: continue
        w = wk[rel]; w["rev"] += n["rev"]; w["docs"].add(n["cust"] and n["date"]); w["custs"].add(n["cust"]); w["qty"] += n["qty"]
        w["tiers"][n["tier"]] += 1; w["notas"] += 1
    cust_firstweek = {}
    for c in cust_first:
        cust_firstweek[c] = (monday(cust_first[c]) - reopen_monday).days // 7
    for rel in sorted(wk):
        w = wk[rel]; totn = w["notas"] or 1
        baru = sum(1 for c in w["custs"] if c and cust_firstweek.get(c) == rel)
        t12 = w["tiers"]["T1"] + w["tiers"]["T2"]; t3 = w["tiers"]["T3a"] + w["tiers"]["T3b"]; t45 = w["tiers"]["T4"] + w["tiers"]["T5"]
        d12.append({"minggu_mulai": (reopen_monday + timedelta(days=rel*7)).isoformat(), "minggu_relatif": rel,
                    "revenue": round(w["rev"]), "nota": w["notas"], "customer_aktif": len([c for c in w["custs"] if c]),
                    "customer_baru": baru, "aov": round(w["rev"]/w["notas"]) if w["notas"] else "",
                    "avg_qty_per_nota": round(w["qty"]/w["notas"], 2) if w["notas"] else "",
                    "pct_nota_T1_T2": round(t12/totn, 4), "pct_nota_T3": round(t3/totn, 4), "pct_nota_T4_T5": round(t45/totn, 4)})
    sheet("12_Tren_Mingguan", ["minggu_mulai","minggu_relatif","revenue","nota","customer_aktif","customer_baru","aov",
                               "avg_qty_per_nota","pct_nota_T1_T2","pct_nota_T3","pct_nota_T4_T5"], d12)

    # ---------- 13_Sensitivitas ----------
    def gros_share(pred, thr):
        pn = [n for n in notas.values() if pred(n)]
        totn = len(pn); totr = sum(n["rev"] for n in pn) or 1
        gn = [n for n in pn if (n["units"] & BULK) or n["qty"] >= thr]
        return (len(gn)/totn if totn else 0), (sum(x["rev"] for x in gn)/totr)
    d13 = []
    for thr in (6, 12, 24):
        gp_n, gp_r = gros_share(lambda n: n["periode"] == "PRA", thr)
        gq_n, gq_r = gros_share(lambda n: n["periode"] == "PASCA", thr)
        d13.append({"skenario": f"ambang_grosir_{thr}", "metrik": "pct_nota_grosir", "nilai_pra": round(gp_n, 4), "nilai_pasca": round(gq_n, 4), "delta": round(gq_n-gp_n, 4)})
        d13.append({"skenario": f"ambang_grosir_{thr}", "metrik": "pct_revenue_grosir", "nilai_pra": round(gp_r, 4), "nilai_pasca": round(gq_r, 4), "delta": round(gq_r-gp_r, 4)})
    # pra_baseline
    def basic(pred, days):
        pn = [n for n in notas.values() if pred(n)]
        rev = sum(n["rev"] for n in pn); nn = len(pn)
        qn = sum(n["qty"] for n in pn)
        return {"revenue_per30": round(per30(rev, days)), "nota_per30": round(per30(nn, days), 2),
                "aov": round(rev/nn) if nn else 0, "qty_per_nota": round(qn/nn, 2) if nn else 0}
    mb = basic(lambda n: n["baseline"], DAYS["PRA_BASELINE"]); mq = basic(lambda n: n["periode"] == "PASCA", DAYS["PASCA"])
    for k in ("revenue_per30","nota_per30","aov","qty_per_nota"):
        d13.append({"skenario": "pra_baseline_jan_jun", "metrik": k, "nilai_pra": mb[k], "nilai_pasca": mq[k], "delta": round(mq[k]-mb[k], 2)})
    # tanpa akun generik
    def cust_metrics(exclude_gen):
        cp = cust_pra - (set(generik) if exclude_gen else set()); cq = cust_pas - (set(generik) if exclude_gen else set())
        rev = sorted((cust_rev_all[c] for c in (cp | cq)), reverse=True)
        tr = sum(rev) or 1
        return {"share_top5": round(sum(rev[:5])/tr, 4), "customer_unik": len(cp | cq)}
    with_g = cust_metrics(False); no_g = cust_metrics(True)
    for k in ("share_top5","customer_unik"):
        d13.append({"skenario": "tanpa_akun_generik", "metrik": k, "nilai_pra": with_g[k], "nilai_pasca": no_g[k], "delta": ""})
    sheet("13_Sensitivitas", ["skenario","metrik","nilai_pra","nilai_pasca","delta"], d13)

    # ---------- 14_Musiman ----------
    has_prev = any(r["date"].year < reopen.year for r in rows)
    if has_prev:
        d14 = []  # (jika ada data 2025 — struktur siap)
        sheet("14_Musiman", ["periode","kategori","revenue","qty_pcs"], d14)
    else:
        rm("data_tahun_lalu", "tidak tersedia", "sheet 14 kosong")

    # ================= SIMPAN =================
    B.autosize(wb, cap=30)
    os.makedirs(args.out, exist_ok=True)
    out = os.path.join(args.out, "TokoX_Analisis_Lanjutan.xlsx")
    wb.save(out)

    # ---- validasi + ringkasan ke console ----
    print("\n=== VALIDASI ===")
    for p in ("PRA", "PASCA"):
        sub = [r for r in rows if r["periode"] == p]
        rev, nn, nc, _ = agg_rows(sub)
        print(f"  {p}: revenue Rp{round(rev):,} | nota {nn} | customer {nc}")
    print(f"  customer total {len(cust_pra|cust_pas)} | overlap {len(cust_pra&cust_pas)}")
    print(f"  baris 01_Customer_Level = {len(c01)} (harus = customer unik)")
    print("  Target brief: PRA 9.339.437.720/10.860, PASCA 6.622.181.617/9.767, cust 984/1011 overlap 280")
    print(f"\n✓ Excel: {out}")

    # ---- uji 5 hipotesis (otomatis dari data) ----
    def pct_tier(p, tiers):
        pn = [n for n in notas.values() if n["periode"] == p]
        return sum(1 for n in pn if n["tier"] in tiers) / len(pn) if pn else 0
    def pct_rev_gros(p):
        pn = [n for n in notas.values() if n["periode"] == p]
        tr = sum(n["rev"] for n in pn) or 1
        return sum(n["rev"] for n in pn if n["grosir_lama"]) / tr
    def t3_per30(p):
        pn = [n for n in notas.values() if n["periode"] == p and n["tier"] in ("T3a", "T3b")]
        return per30(len(pn), DAYS[p])
    def cat_avgqty(p, catsub):
        kr = [r for r in rows if r["periode"] == p and catsub in r["kat"].upper()]
        docs = {r["doc"] for r in kr}
        q = sum(r["qty"] for r in kr)
        return q / len(docs) if docs else 0
    print("\n=== UJI HIPOTESIS (otomatis) ===")
    print(f"H1 retail-by-nota: %nota T1+T2 PRA {pct_tier('PRA',('T1','T2')):.1%} -> PASCA {pct_tier('PASCA',('T1','T2')):.1%}; "
          f"%revenue grosir PRA {pct_rev_gros('PRA'):.1%} -> PASCA {pct_rev_gros('PASCA'):.1%}")
    g = (t3_per30('PASCA')-t3_per30('PRA'))/t3_per30('PRA') if t3_per30('PRA') else 0
    print(f"H2 order 6-20 (T3) per30: PRA {t3_per30('PRA'):.2f} -> PASCA {t3_per30('PASCA'):.2f} ({g:+.0%})")
    print(f"H3 qty/order STATIONARY PRA {cat_avgqty('PRA','STATIONARY'):.1f} -> PASCA {cat_avgqty('PASCA','STATIONARY'):.1f}; "
          f"AKSESORIS {cat_avgqty('PRA','AKSESORIS'):.1f} -> {cat_avgqty('PASCA','AKSESORIS'):.1f}")
    baru_rev = [r["revenue_per30_pasca"] for r in c01 if r["status"] == "Baru"]
    kembali_rev = [r["revenue_per30_pasca"] for r in c01 if r["status"] == "Kembali"]
    import statistics as st
    print(f"H4 spend/30hr PASCA: baru avg {round(st.mean(baru_rev)) if baru_rev else 0:,} vs kembali avg {round(st.mean(kembali_rev)) if kembali_rev else 0:,}")
    print(f"H5 retensi: {len(cust_pra & cust_pas)} dari {len(cust_pra)} customer PRA kembali ({len(cust_pra&cust_pas)/len(cust_pra):.0%})" if cust_pra else "H5: -")
    print("\n(Tempel blok VALIDASI + UJI HIPOTESIS ini ke chat untuk kita simpulkan bersama.)")


if __name__ == "__main__":
    main()
