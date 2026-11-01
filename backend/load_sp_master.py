"""
Muat sp_master.xlsx -> tabel Supabase `sp_master` (+ seed `settings_target_branch`).
Jalankan SETELAH sp_master_schema.sql.

  python load_sp_master.py "C:/path/sp_master.xlsx" [--dry] [--replace]

- sp_master: 1 baris per slp_name (tipe, kode, tim, aktif, branch_utama).
- settings_target_branch: target bulanan (Agu-Des 2026) di-assign ke branch_utama tiap SP
  (opsi 2b: nanti bisa diedit per-branch di Settings).
"""
import sys, os
import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

MONTHS = {"t_agu": 8, "t_sep": 9, "t_okt": 10, "t_nov": 11, "t_des": 12}
TARGET_YEAR = 2026


def _num(v):
    try:
        return float(v)
    except Exception:
        return None


def parse(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["sp_master"]; rows = list(ws.iter_rows(values_only=True))
    hdr = rows[0]; ci = {h: i for i, h in enumerate(hdr)}
    sp_rows, tgt_rows = [], []
    for r in rows[1:]:
        if not r[0]:
            continue
        name = str(r[0]).strip()
        branch = (r[ci["branch_utama"]] or "").strip()
        sp_rows.append({
            "slp_name": name, "tipe": r[ci["tipe"]], "kode_sp": r[ci["kode_sp"]] or None,
            "tim": r[ci["tim"]] or None, "aktif_q4": str(r[ci["aktif_q4"]]).strip().upper() == "Y",
            "branch_utama": branch or None,
        })
        if branch and branch != "(KOSONG)":
            for col, mo in MONTHS.items():
                t = _num(r[ci[col]])
                if t is not None:
                    tgt_rows.append({"slp_name": name, "branch": branch, "tahun": TARGET_YEAR,
                                     "bulan": mo, "target": t})
    return sp_rows, tgt_rows


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit('Pakai: python load_sp_master.py "path/sp_master.xlsx" [--dry] [--replace]')
    path = args[0]
    dry = "--dry" in sys.argv; replace = "--replace" in sys.argv
    sp_rows, tgt_rows = parse(path)
    from collections import Counter
    print(f"sp_master: {len(sp_rows)} nama ({dict(Counter(s['tipe'] for s in sp_rows))})")
    print(f"settings_target_branch: {len(tgt_rows)} baris target (Agu-Des {TARGET_YEAR})")
    if dry:
        print("\n(--dry) contoh sp_master:")
        for s in sp_rows[:3]:
            print("  ", s)
        print("(--dry) contoh target:")
        for t in tgt_rows[:3]:
            print("  ", t)
        print("\n(--dry) tidak menulis ke DB.")
        return

    from utils.db import get_client
    db = get_client()
    if replace:
        db.table("settings_target_branch").delete().neq("slp_name", "__none__").execute()
        db.table("sp_master").delete().neq("slp_name", "__none__").execute()
        print("Tabel lama dikosongkan (--replace).")
    for i in range(0, len(sp_rows), 500):
        db.table("sp_master").upsert(sp_rows[i:i+500], on_conflict="slp_name").execute()
    for i in range(0, len(tgt_rows), 500):
        db.table("settings_target_branch").upsert(
            tgt_rows[i:i+500], on_conflict="slp_name,branch,tahun,bulan").execute()
    print("✓ sp_master & settings_target_branch terisi.")


if __name__ == "__main__":
    main()
