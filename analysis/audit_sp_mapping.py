"""
Audit pemetaan Salesperson — cocokkan SlpName di data transaksi dengan sp_master.xlsx,
termasuk matcher FUZZY (nama tak selalu persis) + tiebreaker branch (aturan dokumen).
READ-ONLY. Untuk validasi sebelum ingest master & ubah dashboard.

  python analysis/audit_sp_mapping.py --master "C:/path/sp_master.xlsx" [--out DIR] [--min-year 2025]

Output: ~/Bloomie_Analysis/Audit_SP_Mapping.xlsx (+ ringkasan konsol).
"""
import os, sys, argparse, difflib
from collections import defaultdict
import openpyxl

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
                          "branch_cocok": "Y" if norm(bm) == norm(exact["branch"] or "") else "N", "kandidat_lain": ""})
            continue
        cands = sorted(((score(slp, m["slp_name"]), m) for m in master), key=lambda x: -x[0])[:3]
        best_s, best = cands[0]
        if best_s >= 100: matched_master.add(norm(best["slp_name"]))
        status = "FUZZY" if best_s >= 80 else "TAK COCOK"
        kl = "; ".join(f"{m['slp_name']} ({s})" for s, m in cands[1:])
        audit.append({"slp_name_data": slp, "revenue": round(rev[slp]), "rev_pct": round(rev[slp]/total_rev*100, 2),
                      "branch_mayoritas_data": bm, "status": status,
                      "master_name": best["slp_name"] if best_s >= 80 else "",
                      "tipe": best["tipe"] if best_s >= 80 else "", "kode": (best["kode"] or "") if best_s >= 80 else "",
                      "aktif": best["aktif"] if best_s >= 80 else "",
                      "branch_master": best["branch"] if best_s >= 80 else "",
                      "skor": best_s,
                      "branch_cocok": ("Y" if norm(bm) == norm(best["branch"] or "") else "N") if best_s >= 80 else "",
                      "kandidat_lain": kl})

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
            "tipe", "kode", "aktif", "branch_master", "skor", "branch_cocok", "kandidat_lain"]
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
          {"item": "match_fuzzy_>=80", "nilai": st.get("FUZZY", 0)},
          {"item": "tak_cocok_<80", "nilai": st.get("TAK COCOK", 0)},
          {"item": "master_tak_muncul_di_data", "nilai": len(master_missing)},
          {"item": "SP_aktif_Q4_terdeteksi", "nilai": aktif_found, "catatan": "target 21"}]
    for t, v in sorted(rev_by_tipe.items(), key=lambda x: -x[1]):
        d0.append({"item": f"rev%_{t}", "nilai": round(v/total_rev*100, 1)})
    sheet("00_Ringkasan", ["item", "nilai", "catatan"], d0)

    os.makedirs(args.out, exist_ok=True)
    out = os.path.join(args.out, "Audit_SP_Mapping.xlsx")
    wb.save(out)
    print("\n=== RINGKASAN ===")
    print(f"  EXACT {st.get('EXACT',0)} | FUZZY {st.get('FUZZY',0)} | TAK COCOK {st.get('TAK COCOK',0)} | master tak muncul {len(master_missing)}")
    print(f"  SP aktif Q4 terdeteksi: {aktif_found}/21")
    print("  rev% per tipe:", {t: round(v/total_rev*100, 1) for t, v in sorted(rev_by_tipe.items(), key=lambda x: -x[1])})
    print("\n  FUZZY/TAK COCOK yang perlu dilihat (skor<100, by revenue):")
    for a in [x for x in audit if x["status"] != "EXACT"][:20]:
        print(f"    {a['slp_name_data'][:28]:28} skor {a['skor']:>5} -> {a['master_name'][:26]:26} | {a['kandidat_lain'][:40]}")
    print(f"\n✓ Excel: {out}")


if __name__ == "__main__":
    main()
