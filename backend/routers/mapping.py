"""
Endpoint CRUD untuk mapping atribusi SP berbasis Kode C (effective-dated).
Tabel: map_customer_c (customer->C), map_c_salesperson (C->salesperson).
Belum menyentuh pipeline/atribusi dashboard — murni kelola data mapping.
"""
from fastapi import APIRouter, Query, Body
from typing import Optional
from datetime import date, timedelta
from utils.db import get_client

router = APIRouter()


def _all(tbl, cols="*", flt=None):
    """Ambil semua baris (lewati batas 1000 Supabase) via range paging."""
    db = get_client()
    out, step, i = [], 1000, 0
    while True:
        q = db.table(tbl).select(cols)
        if flt:
            q = flt(q)
        r = q.range(i, i + step - 1).execute()
        d = r.data or []
        out.extend(d)
        if len(d) < step:
            break
        i += step
    return out


def _prev_day(iso):
    return (date.fromisoformat(iso) - timedelta(days=1)).isoformat()


# ----------------------------- Customer -> Kode C -----------------------------
@router.get("/customer-c")
def list_customer_c(search: Optional[str] = Query(None), kode_c: Optional[str] = Query(None),
                    only_unmapped: bool = Query(False), page: int = Query(1), limit: int = Query(50)):
    """Daftar customer (dari dim_customer = anchor) + Kode C aktifnya (valid_to NULL)."""
    cur = {r["customer_code"]: r["kode_c"] for r in
           _all("map_customer_c", "customer_code,kode_c", lambda q: q.is_("valid_to", "null"))}
    dc = _all("dim_customer", "customer_code,customer_name,total_revenue,salesperson_utama")
    rows = []
    for c in dc:
        code = c["customer_code"]
        kc = cur.get(code, "")
        rows.append({"customer_code": code, "customer_name": c.get("customer_name"),
                     "total_revenue": c.get("total_revenue"), "slp_name_transaksi": c.get("salesperson_utama"),
                     "kode_c": kc})
    if only_unmapped:
        rows = [r for r in rows if not r["kode_c"]]
    if kode_c:
        rows = [r for r in rows if r["kode_c"] == kode_c]
    if search:
        s = search.lower()
        rows = [r for r in rows if s in (r["customer_name"] or "").lower() or s in r["customer_code"].lower()]
    rows.sort(key=lambda r: -(float(r["total_revenue"] or 0)))
    total = len(rows)
    start = (page - 1) * limit
    return {"data": rows[start:start + limit], "total": total, "page": page, "limit": limit}


@router.post("/customer-c")
def save_customer_c(payload: dict = Body(...)):
    """Simpan perubahan Kode C per customer (effective-dated).
    body: {"changes":[{"customer_code","kode_c","valid_from"}], "default_valid_from":"YYYY-MM-DD"}
    Hanya baris yang Kode C-nya BERUBAH yang ditulis; periode lama ditutup."""
    db = get_client()
    changes = payload.get("changes") or []
    dflt = payload.get("default_valid_from") or date.today().isoformat()
    cur = {r["customer_code"]: r for r in
           _all("map_customer_c", "customer_code,kode_c,valid_from",
                lambda q: q.is_("valid_to", "null"))}
    written = 0
    for ch in changes:
        code = (ch.get("customer_code") or "").strip()
        kc = (ch.get("kode_c") or "").strip()
        vf = (ch.get("valid_from") or dflt)
        if not code or not kc:
            continue
        old = cur.get(code)
        if old and old["kode_c"] == kc:
            continue  # tak berubah
        if old:
            # tutup periode lama (valid_to = sehari sebelum vf)
            db.table("map_customer_c").update({"valid_to": _prev_day(vf)}) \
                .eq("customer_code", code).is_("valid_to", "null").execute()
        db.table("map_customer_c").upsert(
            {"customer_code": code, "kode_c": kc, "valid_from": vf, "valid_to": None},
            on_conflict="customer_code,valid_from").execute()
        written += 1
    return {"written": written}


@router.get("/customer-c/history")
def customer_c_history(customer_code: str = Query(...)):
    rows = _all("map_customer_c", "customer_code,kode_c,valid_from,valid_to",
                lambda q: q.eq("customer_code", customer_code))
    rows.sort(key=lambda r: r["valid_from"])
    return rows


# ----------------------------- Kode C -> Salesperson -----------------------------
@router.get("/c-salesperson")
def list_c_salesperson():
    """Semua penugasan C->salesperson (riwayat), urut kode_c lalu tanggal."""
    rows = _all("map_c_salesperson", "kode_c,slp_name,valid_from,valid_to")
    rows.sort(key=lambda r: (r["kode_c"], r["valid_from"]))
    return rows


@router.post("/c-salesperson")
def save_c_salesperson(payload: dict = Body(...)):
    """Tambah/ubah penugasan C->salesperson effective-dated.
    body: {"kode_c","slp_name","valid_from"} — menutup periode terbuka sebelumnya."""
    db = get_client()
    kc = (payload.get("kode_c") or "").strip()
    slp = (payload.get("slp_name") or "").strip()
    vf = (payload.get("valid_from") or date.today().isoformat())
    if not kc or not slp:
        return {"error": "kode_c & slp_name wajib"}
    # tutup periode terbuka sebelumnya utk kode_c ini
    db.table("map_c_salesperson").update({"valid_to": _prev_day(vf)}) \
        .eq("kode_c", kc).is_("valid_to", "null").execute()
    db.table("map_c_salesperson").upsert(
        {"kode_c": kc, "slp_name": slp, "valid_from": vf, "valid_to": None},
        on_conflict="kode_c,valid_from").execute()
    return {"ok": True}


@router.delete("/c-salesperson")
def delete_c_salesperson(kode_c: str = Query(...), valid_from: str = Query(...)):
    get_client().table("map_c_salesperson").delete() \
        .eq("kode_c", kode_c).eq("valid_from", valid_from).execute()
    return {"ok": True}


@router.get("/c-codes")
def c_codes():
    """Daftar Kode C unik (dari map_customer_c) + jumlah customer + apakah sudah ada salesperson."""
    from collections import Counter
    cnt = Counter(r["kode_c"] for r in _all("map_customer_c", "kode_c",
                  lambda q: q.is_("valid_to", "null")))
    has_slp = {r["kode_c"] for r in _all("map_c_salesperson", "kode_c",
               lambda q: q.is_("valid_to", "null"))}
    return [{"kode_c": k, "n_customer": n, "ada_salesperson": k in has_slp}
            for k, n in sorted(cnt.items(), key=lambda x: -x[1])]
