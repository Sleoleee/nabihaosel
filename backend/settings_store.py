"""
Sumber tunggal untuk membaca setting GRUP & TARGET salesperson dari Supabase.
Dibaca live oleh endpoint (Sales Performance, Overview) & halaman Setting.

Perilaku fallback:
- Kalau tabel setting belum punya baris untuk (slp_name, tahun), pakai default
  dari sales_targets.py (grup = SPV hasil match, atau 'Lainnya'; target = target
  match atau 0). Jadi tampilan tidak berubah sampai user mulai mengedit.
"""
from utils.db import get_client
from sales_targets import SALESPERSONS, match_salesperson

GROUP_LAINNYA = "Lainnya"


def _defaults_for(slp_name):
    m = match_salesperson(slp_name)
    if m:
        return m["team"], m["name"], int(m["target"] or 0)
    return GROUP_LAINNYA, slp_name, 0


def get_group_map(year):
    """{slp_name: grup} dari DB untuk tahun tsb (hanya yang eksplisit disetel)."""
    db = get_client()
    try:
        rows = db.table("settings_salesperson_group").select("slp_name,grup").eq(
            "tahun", int(year)).limit(100000).execute().data or []
        return {r["slp_name"]: (r.get("grup") or GROUP_LAINNYA) for r in rows}
    except Exception:
        return {}


def get_target_map(year):
    """{slp_name: target} dari DB untuk tahun tsb (hanya yang eksplisit disetel)."""
    db = get_client()
    try:
        rows = db.table("settings_target").select("slp_name,target").eq(
            "tahun", int(year)).limit(100000).execute().data or []
        return {r["slp_name"]: float(r.get("target") or 0) for r in rows}
    except Exception:
        return {}


def get_registry(year):
    """{slp_name: {channel, spv, aktif}} dari settings_salesperson untuk tahun tsb."""
    db = get_client()
    try:
        rows = db.table("settings_salesperson").select("slp_name,channel,spv,aktif").eq(
            "tahun", int(year)).limit(100000).execute().data or []
        return {r["slp_name"]: {"channel": r.get("channel"),
                                "spv": (r.get("spv") or GROUP_LAINNYA),
                                "aktif": r.get("aktif", True)} for r in rows}
    except Exception:
        return {}


def effective_group(slp_name, gmap, reg=None):
    """SPV efektif: registry baru (settings_salesperson) > settings_salesperson_group > default match."""
    if reg and slp_name in reg:
        return reg[slp_name]["spv"] or GROUP_LAINNYA
    if slp_name in gmap:
        return gmap[slp_name]
    return _defaults_for(slp_name)[0]


def effective_channel(slp_name, reg=None):
    """Channel organisasi salesperson dari registry; default: K25 bila cocok formasi, else None."""
    if reg and slp_name in reg and reg[slp_name].get("channel"):
        return reg[slp_name]["channel"]
    m = match_salesperson(slp_name)
    return "K25" if m else None


def is_aktif(slp_name, reg=None):
    if reg and slp_name in reg:
        return bool(reg[slp_name].get("aktif", True))
    return True


def effective_target(slp_name, tmap):
    if slp_name in tmap:
        return tmap[slp_name]
    return _defaults_for(slp_name)[2]


def display_name(slp_name):
    return _defaults_for(slp_name)[1]


def get_customer_group_map():
    """{customer_code: group_name} dari tabel customer_group (mapping client->group induk)."""
    db = get_client()
    try:
        rows = db.table("customer_group").select("customer_code,group_name").limit(100000).execute().data or []
        return {r["customer_code"]: (r.get("group_name") or None) for r in rows if r.get("group_name")}
    except Exception:
        return {}
