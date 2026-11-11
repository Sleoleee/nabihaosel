"""
Endpoint CRUD untuk mapping atribusi SP berbasis Kode C (effective-dated).
Tabel: map_customer_c (customer->C), map_c_salesperson (C->salesperson).
Belum menyentuh pipeline/atribusi dashboard — murni kelola data mapping.
"""
from fastapi import APIRouter, Query, Body
from typing import Optional
from datetime import date, timedelta
from collections import defaultdict
from utils.db import get_client
import config

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
    grp = {r["customer_code"]: r.get("group_name") or "" for r in
           _all("customer_group", "customer_code,group_name")}
    dc = _all("dim_customer", "customer_code,customer_name,total_revenue,salesperson_utama")
    rows = []
    for c in dc:
        code = c["customer_code"]
        kc = cur.get(code, "")
        rows.append({"customer_code": code, "customer_name": c.get("customer_name"),
                     "total_revenue": c.get("total_revenue"), "slp_name_transaksi": c.get("salesperson_utama"),
                     "kode_c": kc, "group_head": grp.get(code, "")})
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


@router.post("/customer-group")
def save_customer_group(payload: dict = Body(...)):
    """Simpan Group induk (head) per customer (snapshot, tanpa tanggal).
    body: {"changes":[{"customer_code","group_head"}]}"""
    db = get_client()
    changes = payload.get("changes") or []
    # nama customer utk disimpan bareng (opsional)
    names = {}
    pl = []
    for ch in changes:
        code = (ch.get("customer_code") or "").strip()
        g = (ch.get("group_head") or "").strip()
        if not code:
            continue
        pl.append({"customer_code": code, "group_name": g or None})
    written = 0
    for i in range(0, len(pl), 500):
        db.table("customer_group").upsert(pl[i:i+500], on_conflict="customer_code").execute()
        written += len(pl[i:i+500])
    return {"written": written}


@router.get("/group-members")
def group_members(group: str = Query(...)):
    """Anak-anak di dalam satu Group induk + salesperson & revenue masing-masing (utk Customer Dashboard)."""
    codes = [r["customer_code"] for r in
             _all("customer_group", "customer_code,group_name") if (r.get("group_name") or "") == group]
    if not codes:
        return {"group": group, "members": []}
    dcset = {r["customer_code"]: r for r in _all("dim_customer",
             "customer_code,customer_name,total_revenue,salesperson_utama,days_since_last_order")}
    cur_c = {r["customer_code"]: r["kode_c"] for r in
             _all("map_customer_c", "customer_code,kode_c", lambda q: q.is_("valid_to", "null"))}
    csp = {r["kode_c"]: r["slp_name"] for r in
           _all("map_c_salesperson", "kode_c,slp_name", lambda q: q.is_("valid_to", "null"))}
    members = []
    for code in codes:
        d = dcset.get(code, {})
        kc = cur_c.get(code, "")
        members.append({"customer_code": code, "customer_name": d.get("customer_name") or code,
                        "revenue": d.get("total_revenue") or 0, "kode_c": kc,
                        "salesperson": csp.get(kc) or d.get("salesperson_utama") or "",
                        "days_since_last_order": d.get("days_since_last_order")})
    members.sort(key=lambda m: -(float(m["revenue"] or 0)))
    return {"group": group, "members": members}


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
    sp_now = {r["kode_c"]: r["slp_name"] for r in
              _all("map_c_salesperson", "kode_c,slp_name", lambda q: q.is_("valid_to", "null"))}
    spv_now = {r["kode_c"]: r["spv"] for r in
               _all("map_c_spv", "kode_c,spv", lambda q: q.is_("valid_to", "null"))}
    ns = {r["kode_c"] for r in _all("kode_c_meta", "kode_c,is_non_sales") if r.get("is_non_sales")}
    return [{"kode_c": k, "n_customer": n, "ada_salesperson": k in sp_now,
             "salesperson": sp_now.get(k, ""), "spv": spv_now.get(k, ""),
             "is_non_sales": (k in ns or config.is_non_sales_c(k))}
            for k, n in sorted(cnt.items(), key=lambda x: -x[1])]


# ----------------------------- SPV -> Kode C (effective-dated) -----------------------------
@router.get("/c-spv")
def list_c_spv():
    rows = _all("map_c_spv", "kode_c,spv,valid_from,valid_to")
    rows.sort(key=lambda r: (r.get("spv") or "", r["kode_c"], r["valid_from"]))
    return rows


@router.post("/c-spv")
def save_c_spv(payload: dict = Body(...)):
    """body: {kode_c, spv, valid_from} — menutup periode SPV terbuka sebelumnya utk kode_c itu."""
    db = get_client()
    kc = (payload.get("kode_c") or "").strip()
    spv = (payload.get("spv") or "").strip()
    vf = (payload.get("valid_from") or date.today().isoformat())
    if not kc or not spv:
        return {"error": "kode_c & spv wajib"}
    db.table("map_c_spv").update({"valid_to": _prev_day(vf)}) \
        .eq("kode_c", kc).is_("valid_to", "null").execute()
    db.table("map_c_spv").upsert(
        {"kode_c": kc, "spv": spv, "valid_from": vf, "valid_to": None},
        on_conflict="kode_c,valid_from").execute()
    return {"ok": True}


@router.delete("/c-spv")
def delete_c_spv(kode_c: str = Query(...), valid_from: str = Query(...)):
    get_client().table("map_c_spv").delete() \
        .eq("kode_c", kode_c).eq("valid_from", valid_from).execute()
    return {"ok": True}


@router.get("/spv-suggest")
def spv_suggest():
    return sorted({(r.get("spv") or "").strip() for r in _all("map_c_spv", "spv") if (r.get("spv") or "").strip()})


# ----------------------------- Non-sales flag per Kode C -----------------------------
@router.post("/kode-meta")
def set_kode_meta(payload: dict = Body(...)):
    """Tandai Kode C non-sales (atau balikkan). body: {kode_c, is_non_sales, catatan?}"""
    kc = (payload.get("kode_c") or "").strip()
    if not kc:
        return {"error": "kode_c wajib"}
    get_client().table("kode_c_meta").upsert(
        {"kode_c": kc, "is_non_sales": bool(payload.get("is_non_sales")), "catatan": payload.get("catatan")},
        on_conflict="kode_c").execute()
    return {"ok": True}


# ----------------------------- Target per Kode C per bulan -----------------------------
@router.get("/target-c")
def get_target_c(tahun: int = Query(...)):
    rows = _all("target_c", "kode_c,tahun,bulan,target", lambda q: q.eq("tahun", tahun))
    return rows


@router.post("/target-c")
def save_target_c(payload: dict = Body(...)):
    """body: {rows:[{kode_c,tahun,bulan,target}]}"""
    rows = payload.get("rows") or []
    pl = [{"kode_c": r["kode_c"], "tahun": int(r["tahun"]), "bulan": int(r["bulan"]),
           "target": float(r.get("target") or 0)} for r in rows if r.get("kode_c")]
    db = get_client()
    for i in range(0, len(pl), 500):
        db.table("target_c").upsert(pl[i:i+500], on_conflict="kode_c,tahun,bulan").execute()
    return {"saved": len(pl)}


# ----------------------------- Saran nama salesperson -----------------------------
@router.get("/slp-suggest")
def slp_suggest():
    """Nama yg pernah dipakai (transaksi + mapping) utk autosuggest, bukan daftar terkunci."""
    names = set()
    for r in _all("dim_salesperson", "slp_name"):
        n = (r.get("slp_name") or "").strip()
        if n and not config.is_non_person_slp(n):
            names.add(n)
    for r in _all("map_c_salesperson", "slp_name"):
        n = (r.get("slp_name") or "").strip()
        if n:
            names.add(n)
    return sorted(names)


# ----------------------------- Kesehatan Data (gate Fase 3) -----------------------------
@router.get("/health")
def health():
    """Pindai anchor (dim_customer/dim_salesperson) vs mapping; laporkan gap + dampak revenue.
    Non-sales C (Non Trade/BLANKS) tidak dihitung sebagai gap."""
    cur_c = {r["customer_code"]: r["kode_c"] for r in
             _all("map_customer_c", "customer_code,kode_c", lambda q: q.is_("valid_to", "null"))}
    csp_now = {r["kode_c"] for r in
               _all("map_c_salesperson", "kode_c", lambda q: q.is_("valid_to", "null"))}
    ns_meta = {r["kode_c"] for r in _all("kode_c_meta", "kode_c,is_non_sales") if r.get("is_non_sales")}
    def is_ns(kc): return kc in ns_meta or config.is_non_sales_c(kc)
    dc = _all("dim_customer", "customer_code,total_revenue")
    total_rev = sum(float(c.get("total_revenue") or 0) for c in dc) or 1.0

    buckets = {"ok": [0, 0.0], "tanpa_c": [0, 0.0], "c_tanpa_sp": [0, 0.0], "non_sales": [0, 0.0]}
    c_missing_sp = defaultdict(lambda: [0, 0.0])   # kode_c -> [n_cust, rev]
    for c in dc:
        code = c["customer_code"]; rev = float(c.get("total_revenue") or 0)
        kc = cur_c.get(code)
        if not kc:
            b = "tanpa_c"
        elif is_ns(kc):
            b = "non_sales"
        elif kc in csp_now:
            b = "ok"
        else:
            b = "c_tanpa_sp"; m = c_missing_sp[kc]; m[0] += 1; m[1] += rev
        buckets[b][0] += 1; buckets[b][1] += rev

    # SlpName di transaksi tak dikenal di sp_master (cross-check)
    spm = {r["slp_name"] for r in _all("sp_master", "slp_name")}
    ds = _all("dim_salesperson", "slp_name,total_revenue")
    slp_baru = [{"slp_name": r["slp_name"], "revenue": round(float(r.get("total_revenue") or 0))}
                for r in ds if r["slp_name"] and r["slp_name"] not in spm
                and not config.is_non_person_slp(r["slp_name"])]
    slp_baru.sort(key=lambda x: -x["revenue"])

    # Salesperson di mapping yang tak ada di sp_master (putus ke target/tenure)
    map_sp = {r["slp_name"] for r in _all("map_c_salesperson", "slp_name")}
    map_sp_unknown = sorted(s for s in map_sp if s and s not in spm)

    def pct(v): return round(v / total_rev * 100, 1)
    unheld_rev = buckets["tanpa_c"][1] + buckets["c_tanpa_sp"][1]

    return {
        "total_customer": len(dc),
        "total_revenue": round(total_rev),
        "ringkas": {
            "teratribusi":      {"n": buckets["ok"][0], "revenue": round(buckets["ok"][1]), "pct": pct(buckets["ok"][1])},
            "tanpa_pemegang":   {"n": buckets["tanpa_c"][0] + buckets["c_tanpa_sp"][0], "revenue": round(unheld_rev), "pct": pct(unheld_rev)},
            "non_sales_wajar":  {"n": buckets["non_sales"][0], "revenue": round(buckets["non_sales"][1]), "pct": pct(buckets["non_sales"][1])},
        },
        "customer_tanpa_c":  {"n": buckets["tanpa_c"][0], "revenue": round(buckets["tanpa_c"][1]), "pct": pct(buckets["tanpa_c"][1])},
        "kode_c_tanpa_sp": sorted(
            [{"kode_c": k, "n_customer": v[0], "revenue": round(v[1])} for k, v in c_missing_sp.items()],
            key=lambda x: -x["revenue"]),
        "slp_name_baru": slp_baru[:50],
        "mapping_sp_tak_dikenal": map_sp_unknown,
    }
