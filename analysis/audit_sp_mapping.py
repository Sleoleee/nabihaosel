"""
Audit pemetaan Salesperson — cocokkan SlpName di data transaksi dengan sp_master.xlsx,
termasuk matcher FUZZY (nama tak selalu persis) + tiebreaker branch (aturan dokumen).
READ-ONLY. Untuk validasi sebelum ingest master & ubah dashboard.

  python analysis/audit_sp_mapping.py --master "C:/path/sp_master.xlsx" [--out DIR] [--min-year 2025]

Output: ~/Bloomie_Analysis/Audit_SP_Mapping.xlsx (+ ringkasan konsol).
"""
import os, sys, argparse, difflib, re
from collections import defaultdict
import openpyxl

# nama generik / platform (bukan orang) — selain yang sudah ada di master
GENERIK_EXTRA = {"whatsapp", "website", "blibli", "shopee", "tiktok", "tokopedia", "lazada", "web",
                 "-no sales employee-", "administrator", "anonym"}
TOKO_PREFIX = ("TENGSE", "ASEMKA", "DOMPET", "NAMI", "FAMILY")


def branch_core(b):
    return re.sub(r"^\d+\.\s*", "", str(b or "").strip().upper()).strip()


def fallback_tipe(name, branch_major):
    """Klasifikasi nama yang TIDAK ada di master (aturan dokumen §5)."""
    n = str(name or "").strip().lower()
    if n in GENERIK_EXTRA or n.startswith("kasir ") or "kasir mimori" in n:
        return "Generik"
    core = branch_core(branch_major)
    if "K25" in core:
        return "SP lapangan"
    if any(core.startswith(x) for x in TOKO_PREFIX):
        return "Staf toko"
    return "Staf toko"   # branch kosong/kecil -> default staf toko

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
import local_store


def norm(s):
    return " ".join(str(s or "").strip().lower().split())


def _tok_partial(ta, tb):
    """Rata-rata kemiripan token terbaik (menangkap Michella~Michelle, Alim~Alimmy)."""
    short, long = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    if not short or not long:
        return 0.0
    tot = 0.0
    for t in short:
        best = 0.0
        for u in long:
            r = difflib.SequenceMatcher(None, t, u).ratio()
            if (t and u) and (u.startswith(t) or t.startswith(u)):
                r = max(r, 0.9)      # bonus prefix (nama panggilan sering potongan awal)
            best = max(best, r)
        tot += best
    return tot / len(short)


def score(a, b):
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 100.0
    ta, tb = set(na.split()), set(nb.split())
    r_full = difflib.SequenceMatcher(None, na, nb).ratio()
    sa, sb = " ".join(sorted(ta)), " ".join(sorted(tb))
    r_tok = difflib.SequenceMatcher(None, sa, sb).ratio()
    cont = len(ta & tb) / min(len(ta), len(tb)) if ta and tb else 0
    return round(max(r_full, r_tok, cont, _tok_partial(ta, tb)) * 100, 1)


def load_master(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["sp_master"]; rows = list(ws.iter_rows(values_only=True))
    hdr = rows[0]; ci = {h: i for i, h in enumerate(hdr)}
    out = []
    for r in rows[1:]:
        if not r[0]:
            continue
        out.append({"slp_name": str(r[0]).strip(), "tipe": r[ci["tipe"]], "kode": r[ci["kode_sp"]],
                    "tim": r[ci["tim"]], "aktif": r[ci["aktif_q4"]], "branch": r[ci["branch_utama"]]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True, help="path sp_master.xlsx")
    ap.add_argument("--out", default=os.path.join(os.path.expanduser("~"), "Bloomie_Analysis"))
    ap.add_argument("--min-year", type=int, default=2025)
    args = ap.parse_args()

    master = load_master(args.master)
    m_by_norm = {norm(m["slp_name"]): m for m in master}
    print(f"Master: {len(master)} nama.")

    # --- SlpName dari data: revenue + branch-mayoritas ---
    conn = local_store.connect(); local_store.ensure_schema(conn)
    rev = defaultdict(float); brev = defaultdict(lambda: defaultdict(float))
    for r in local_store.iter_rows(conn, cols=["slp_name", "branch", "new_row_total", "year"],
                                   where="CAST(year AS INTEGER) >= ?", params=(args.min_year,)):
        slp = (r.get("slp_name") or "").strip()
        if not slp:
            continue
        v = 0.0
        try: v = float(r.get("new_row_total") or 0)
        except Exception: pass
        rev[slp] += v; brev[slp][(r.get("branch") or "(KOSONG)")] += v
    conn.close()
    total_rev = sum(rev.values()) or 1
    print(f"SlpName unik di data (>= {args.min_year}): {len(rev)}")

    def branch_major(slp):
        d = brev[slp]
        return max(d.items(), key=lambda x: x[1])[0] if d else "(KOSONG)"

    # --- match tiap SlpName data -> master ---
    audit = []
    matched_master = set()
    for slp in sorted(rev, key=lambda x: -rev[x]):
        bm = branch_major(slp)
        exact = m_by_norm.get(norm(slp))
        if exact:
            matched_master.add(norm(exact["slp_name"]))
            audit.append({"slp_name_data": slp, "revenue": round(rev[slp]), "rev_pct": round(rev[slp]/total_rev*100, 2),
                          "branch_mayoritas_data": bm, "status": "EXACT", "master_name": exact["slp_name"],
                          "tipe": exact["tipe"], "kode": exact["kode"] or "", "aktif": exact["aktif"],
                          "branch_master": exact["branch"], "skor": 100.0,
                          "branch_cocok": "Y" if norm(bm) == norm(exact["branch"] or "") else "N", "saran_fuzzy": ""})
            continue
        # TIDAK exact -> klasifikasi via fallback (aturan §5); fuzzy hanya SARAN (tak menentukan tipe)
        cands = sorted(((score(slp, m["slp_name"]), m) for m in master), key=lambda x: -x[0])[:3]
        tipe = fallback_tipe(slp, bm)
        saran = "; ".join(f"{m['slp_name']} ({s})" for s, m in cands)
        audit.append({"slp_name_data": slp, "revenue": round(rev[slp]), "rev_pct": round(rev[slp]/total_rev*100, 2),
                      "branch_mayoritas_data": bm, "status": "FALLBACK-" + ("generik" if tipe == "Generik" else "branch"),
                      "master_name": "", "tipe": tipe, "kode": "", "aktif": "",
                      "branch_master": "", "skor": "", "branch_cocok": "",
                      "saran_fuzzy": saran})

    master_missing = [m for m in master if norm(m["slp_name"]) not in matched_master]

    # ================= WORKBOOK =================
    from openpyxl.styles import Font, PatternFill
    HDR = Font(bold=True, color="FFFFFF"); FILL = PatternFill("solid", fgColor="C00000")
    wb = openpyxl.Workbook(); wb.remove(wb.active)

    def sheet(name, cols, data):
        ws = wb.create_sheet(name[:31]); ws.append(cols)
        for c in ws[1]: c.font = HDR; c.fill = FILL
        for row in data: ws.append([row.get(c, "") for c in cols])
        for i, c in enumerate(cols):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i+1)].width = max(12, min(34, len(c)+3))
        ws.auto_filter.ref = f"A1:{openpyxl.utils.get_column_letter(len(cols))}{ws.max_row}"
        ws.freeze_panes = "A2"
        return ws

    cols = ["slp_name_data", "revenue", "rev_pct", "branch_mayoritas_data", "status", "master_name",
            "tipe", "kode", "aktif", "branch_master", "skor", "branch_cocok", "saran_fuzzy"]
    sheet("01_Audit_SlpName", cols, audit)
    sheet("02_Master_tak_muncul", ["slp_name", "tipe", "kode", "aktif", "branch"],
          [{"slp_name": m["slp_name"], "tipe": m["tipe"], "kode": m["kode"] or "", "aktif": m["aktif"],
            "branch": m["branch"]} for m in master_missing])

    # ringkasan
    from collections import Counter
    st = Counter(a["status"] for a in audit)
    rev_by_tipe = defaultdict(float)
    for a in audit:
        rev_by_tipe[a["tipe"] or "(tak cocok)"] += a["revenue"]
    aktif_found = sum(1 for a in audit if a["aktif"] == "Y")
    d0 = [{"item": "slpname_data_unik", "nilai": len(rev)},
          {"item": "match_exact", "nilai": st.get("EXACT", 0)},
          {"item": "fallback_branch", "nilai": st.get("FALLBACK-branch", 0), "catatan": "tak ada di master -> klasifikasi via branch-mayoritas"},
          {"item": "fallback_generik", "nilai": st.get("FALLBACK-generik", 0)},
          {"item": "master_tak_muncul_di_data", "nilai": len(master_missing)},
          {"item": "SP_aktif_Q4_terdeteksi", "nilai": aktif_found, "catatan": "target 21"}]
    for t, v in sorted(rev_by_tipe.items(), key=lambda x: -x[1]):
        d0.append({"item": f"rev%_{t}", "nilai": round(v/total_rev*100, 1)})
    sheet("00_Ringkasan", ["item", "nilai", "catatan"], d0)

    os.makedirs(args.out, exist_ok=True)
    out = os.path.join(args.out, "Audit_SP_Mapping.xlsx")
    wb.save(out)
    print("\n=== RINGKASAN ===")
    print(f"  EXACT {st.get('EXACT',0)} | fallback-branch {st.get('FALLBACK-branch',0)} | fallback-generik {st.get('FALLBACK-generik',0)} | master tak muncul {len(master_missing)}")
    print(f"  SP aktif Q4 terdeteksi: {aktif_found}/21")
    print("  rev% per tipe:", {t: round(v/total_rev*100, 1) for t, v in sorted(rev_by_tipe.items(), key=lambda x: -x[1])})
    print("\n  Nama FALLBACK (tak ada di master -> diklasifikasi via branch):")
    for a in [x for x in audit if x["status"].startswith("FALLBACK")]:
        print(f"    {a['slp_name_data'][:28]:28} branch={a['branch_mayoritas_data'][:12]:12} -> {a['tipe']:12} | saran: {a['saran_fuzzy'][:40]}")
    print(f"\n✓ Excel: {out}")


if __name__ == "__main__":
    main()
