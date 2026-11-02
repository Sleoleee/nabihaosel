"""
Endpoint menu SETTING: grup salesperson & target per tahun.
Menulis ke tabel settings_* di Supabase; dibaca live (tanpa build_analytics.py).
"""
import os, sys
from fastapi import APIRouter, Query, Body
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.db import get_client
import settings_store as S

router = APIRouter()


def _all_years():
    db = get_client()
    rows = db.table("agg_salesperson_month").select("tahun").limit(100000).execute().data or []
    return sorted({int(r["tahun"]) for r in rows if r.get("tahun")})


def _revenue_by_slp(year):
    """Total revenue per slp_name pada tahun tsb (untuk konteks & urutan)."""
    db = get_client()
    rows = db.table("agg_salesperson_month").select("slp_name,revenue").eq(
        "tahun", int(year)).limit(200000).execute().data or []
    agg = {}
    for r in rows:
        s = r.get("slp_name")
        if not s:
            continue
        agg[s] = agg.get(s, 0.0) + float(r.get("revenue") or 0)
    return agg


def _all_slp_names():
    """Semua nama salesperson yang pernah muncul (lintas tahun & channel)."""
    db = get_client()
    rows = db.table("agg_salesperson_month").select("slp_name").limit(500000).execute().data or []
    return sorted({r["slp_name"] for r in rows if r.get("slp_name")})


@router.get("/years")
def years():
    return {"years": _all_years()}


@router.get("/groups")
def get_groups(year: int = Query(...)):
    gmap = S.get_group_map(year)
    rev = _revenue_by_slp(year)
    names = _all_slp_names()
    people = []
    for s in names:
        people.append({"slp_name": s, "display": S.display_name(s),
                       "grup": S.effective_group(s, gmap),
                       "revenue": round(rev.get(s, 0.0)),
                       "explicit": s in gmap})
    people.sort(key=lambda x: -x["revenue"])
    groups = sorted({p["grup"] for p in people},
                    key=lambda g: (g == S.GROUP_LAINNYA, g))  # Lainnya di akhir
    return {"year": year, "groups": groups, "salespeople": people}


@router.post("/groups")
def save_groups(payload: dict = Body(...)):
    year = int(payload.get("year"))
    assignments = payload.get("assignments") or {}
    db = get_client()
    rows = [{"slp_name": k, "tahun": year, "grup": (v or S.GROUP_LAINNYA)}
            for k, v in assignments.items()]
    if rows:
        for i in range(0, len(rows), 500):
            db.table("settings_salesperson_group").upsert(
                rows[i:i+500], on_conflict="slp_name,tahun").execute()
    return {"ok": True, "saved": len(rows)}


@router.get("/channels")
def channels():
    import config
    return {"channels": list(config.BRANCH_GROUP_ORDER)}


@router.get("/registry")
def get_registry(year: int = Query(...)):
    """Satu sumber untuk halaman Setting gabungan: channel + SPV + target + aktif per salesperson."""
    reg = S.get_registry(year)
    tmap = S.get_target_map(year)
    rev = _revenue_by_slp(year)
    names = set(_all_slp_names()) | set(reg.keys())
    people = []
    for s in sorted(names):
        people.append({
            "slp_name": s, "display": S.display_name(s),
            "channel": S.effective_channel(s, reg),
            "spv": S.effective_group(s, {}, reg),
            "target": S.effective_target(s, tmap),
            "aktif": S.is_aktif(s, reg),
            "revenue": round(rev.get(s, 0.0)),
            "in_data": s in rev,
        })
    people.sort(key=lambda x: -x["revenue"])
    # daftar SPV & channel yang sudah dipakai (untuk dropdown)
    spvs = sorted({p["spv"] for p in people if p["spv"] and p["spv"] != S.GROUP_LAINNYA})
    import config
    return {"year": year, "salespeople": people,
            "channels": list(config.BRANCH_GROUP_ORDER), "spvs": spvs}


@router.post("/registry")
def save_registry(payload: dict = Body(...)):
    """Simpan baris registry + target sekaligus untuk satu tahun.
    body: {year, rows:[{slp_name, channel, spv, aktif, target}]}"""
    year = int(payload.get("year"))
    rows = payload.get("rows") or []
    db = get_client()
    reg_rows, tgt_rows = [], []
    for r in rows:
        slp = (r.get("slp_name") or "").strip()
        if not slp:
            continue
        spv = (r.get("spv") or "").strip()
        reg_rows.append({"slp_name": slp, "tahun": year,
                         "channel": (r.get("channel") or None),
                         "spv": (None if spv in ("", S.GROUP_LAINNYA, "Tanpa SPV") else spv),
                         "aktif": bool(r.get("aktif", True))})
        if r.get("target") is not None:
            tgt_rows.append({"slp_name": slp, "tahun": year, "target": float(r.get("target") or 0)})
    for i in range(0, len(reg_rows), 500):
        db.table("settings_salesperson").upsert(reg_rows[i:i+500], on_conflict="slp_name,tahun").execute()
    for i in range(0, len(tgt_rows), 500):
        db.table("settings_target").upsert(tgt_rows[i:i+500], on_conflict="slp_name,tahun").execute()
    return {"ok": True, "saved": len(reg_rows)}


@router.get("/targets")
def get_targets(year: int = Query(...)):
    tmap = S.get_target_map(year)
    gmap = S.get_group_map(year)
    rev = _revenue_by_slp(year)
    names = _all_slp_names()
    people = []
    for s in names:
        people.append({"slp_name": s, "display": S.display_name(s),
                       "grup": S.effective_group(s, gmap),
                       "target": S.effective_target(s, tmap),
                       "revenue": round(rev.get(s, 0.0)),
                       "explicit": s in tmap})
    people.sort(key=lambda x: -x["target"] or 0)
    return {"year": year, "salespeople": people}


@router.post("/targets")
def save_targets(payload: dict = Body(...)):
    year = int(payload.get("year"))
    targets = payload.get("targets") or {}
    db = get_client()
    rows = [{"slp_name": k, "tahun": year, "target": float(v or 0)}
            for k, v in targets.items()]
    if rows:
        for i in range(0, len(rows), 500):
            db.table("settings_target").upsert(
                rows[i:i+500], on_conflict="slp_name,tahun").execute()
    return {"ok": True, "saved": len(rows)}


# ==================== SP MAPPING & TARGET PER-BRANCH (opsi 2b) ====================
import difflib, re


def _score(a, b):
    na = " ".join(str(a or "").lower().split()); nb = " ".join(str(b or "").lower().split())
    if not na or not nb:
        return 0.0
    if na == nb:
        return 100.0
    ta, tb = set(na.split()), set(nb.split())
    r_full = difflib.SequenceMatcher(None, na, nb).ratio()
    cont = len(ta & tb) / min(len(ta), len(tb)) if ta and tb else 0
    short, long = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    tp = 0.0
    for t in short:
        best = max((difflib.SequenceMatcher(None, t, u).ratio() for u in long), default=0)
        for u in long:
            if u.startswith(t) or t.startswith(u):
                best = max(best, 0.9)
        tp += best
    tp = tp / len(short) if short else 0
    return round(max(r_full, cont, tp) * 100, 1)


@router.get("/sp-master")
def sp_master_list(tahun: Optional[int] = Query(None)):
    """Daftar SP dari sp_master + konteks revenue (untuk editor)."""
    db = get_client()
    master = db.table("sp_master").select(
        "slp_name,tipe,kode_sp,tim,aktif_q4,branch_utama").limit(100000).execute().data or []
    rev = _revenue_by_slp(tahun) if tahun else {}
    for m in master:
        m["revenue"] = round(rev.get(m["slp_name"], 0))
    master.sort(key=lambda m: (m.get("tipe") != "SP lapangan", not m.get("aktif_q4"), -m.get("revenue", 0)))
    branches = sorted({m.get("branch_utama") for m in master if m.get("branch_utama")})
    return {"salespeople": master, "branches": branches}


@router.get("/sp-targets")
def sp_targets_get(tahun: int = Query(...)):
    db = get_client()
    rows = db.table("settings_target_branch").select(
        "slp_name,branch,tahun,bulan,target").eq("tahun", int(tahun)).limit(100000).execute().data or []
    return {"targets": rows}


@router.post("/sp-targets")
def sp_targets_post(rows: list = Body(..., embed=True)):
    """Upsert target per-SP per-branch per-bulan. rows: [{slp_name,branch,tahun,bulan,target}]."""
    db = get_client()
    clean = [{"slp_name": r["slp_name"], "branch": r["branch"], "tahun": int(r["tahun"]),
              "bulan": int(r["bulan"]), "target": float(r.get("target") or 0)} for r in rows]
    for i in range(0, len(clean), 500):
        db.table("settings_target_branch").upsert(
            clean[i:i+500], on_conflict="slp_name,branch,tahun,bulan").execute()
    return {"ok": True, "saved": len(clean)}


@router.get("/sp-scan")
def sp_scan(name: str = Query(...), limit: int = Query(5)):
    """Saran kecocokan nama (fuzzy) terhadap sp_master. SARAN saja — konfirmasi manusia."""
    db = get_client()
    master = db.table("sp_master").select("slp_name,tipe,kode_sp,aktif_q4,branch_utama").limit(100000).execute().data or []
    scored = sorted(((_score(name, m["slp_name"]), m) for m in master), key=lambda x: -x[0])[:limit]
    return {"query": name, "kandidat": [{**m, "skor": s} for s, m in scored]}
