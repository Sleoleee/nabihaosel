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
