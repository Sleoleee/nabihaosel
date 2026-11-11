"""
Konstanta & pemetaan global — single source of truth.
Ubah di sini, jangan hardcode tersebar di banyak file.
"""
import re

# --- Aturan revenue & dokumen ---
REVENUE_COLUMN = "new_row_total"    # ganti ke "row_total" bila suatu saat dibutuhkan
INCLUDE_OPEN_DOCS = True            # Document Status 'O' ikut dihitung
                                    # (catatan: kolom document_status TIDAK tersimpan di DB,
                                    #  jadi flag ini belum bisa ditegakkan — semua baris terupload dihitung)
MIN_YEAR = 2025                     # abaikan data < 2025 (dashboard hanya 2025-2026)

# --- Ambang lifecycle customer ---
LOST_MULTIPLIER = 3                 # tidak beli >= 3x interval normal => Lost
REACTIVATE_MULTIPLIER = 2          # sempat tidak aktif >= 2x interval lalu beli lagi => Reactivated

# --- Ambang status tren kategori (Report Center File 3) ---
TREND_UP_THRESHOLD = 0.05           # Growth YoY > +5% => Tumbuh
TREND_DOWN_THRESHOLD = -0.05        # Growth YoY < -5% => Turun; di antaranya => Stabil

# --- Kategori non-produk (biaya/pelengkap) ---
NON_CORE_CATEGORIES = {"MARKETPLACE", "BIAYA PACKAGING", "TAS PAPERBAG"}


_NON_CORE_UPPER = {c.upper() for c in NON_CORE_CATEGORIES}


def is_produk_inti(kategori):
    """FALSE untuk kategori non-produk (MARKETPLACE / BIAYA PACKAGING / TAS PAPERBAG)."""
    return (str(kategori).strip().upper() if kategori else "") not in _NON_CORE_UPPER


# --- Brand (dari nilai Kategori khusus; keputusan Fase 0 Report Center, 2026) ---
# Brand = 5 brand bernama saja. Sumber = kolom Kategori (bukan keyword deskripsi).
BRAND_CATEGORIES = {
    "ROCHE": "Roche",
    "MIMORI": "Mimori",
    "GLIMORE": "Glimore",
    "BLISS BEAUTY": "Bliss Beauty",
    "AKSESORIS RAMBUT KAMINO": "Kamino",
}


def brand_of(kategori):
    """Brand resmi dari Kategori, atau None bila bukan item brand."""
    return BRAND_CATEGORIES.get(str(kategori or "").strip().upper())


# --- Resolusi tipe Salesperson untuk nama yang TIDAK ada di sp_master (fallback §5) ---
_SP_TOKO_PREFIX = ("TENGSE", "ASEMKA", "DOMPET", "NAMI", "FAMILY")
_SP_GENERIK_EXTRA = {"whatsapp", "website", "blibli", "shopee", "tiktok", "tokopedia", "lazada", "web"}


def branch_core(branch):
    """Branch tanpa prefix angka, uppercase (mis. '1.K25' -> 'K25')."""
    return re.sub(r"^\d+\.\s*", "", str(branch or "").strip().upper()).strip()


def sp_tipe_fallback(slp_name, branch_utama):
    """Tipe SP untuk nama di luar sp_master: Generik / SP lapangan / Staf toko (aturan dokumen §5)."""
    n = str(slp_name or "").strip().lower()
    if is_non_person_slp(slp_name) or n in _SP_GENERIK_EXTRA or n.startswith("kasir "):
        return "Generik"
    core = branch_core(branch_utama)
    if "K25" in core:
        return "SP lapangan"
    return "Staf toko"


# --- Pemetaan branch -> channel (6 kelompok) ---
BRANCH_GROUP_ORDER = ["E-Commerce", "SUKSES JAYA", "NAMI", "BLOOMIE", "K25", "OTHER CHANNEL"]
CORE_BRANCH = "1.K25"
_ECOMMERCE   = {"SHOPEE", "TIKTOK", "TKPD", "BLIBLI", "LAZADA"}
_SUKSES_JAYA = {"ASEMKA", "TENGSE", "DOMPET"}


# Pola substring branch per channel (untuk hapus data by channel via ilike).
# OTHER CHANNEL = sisanya, tak bisa ditarget dengan pola -> None.
_CHANNEL_PATTERNS = {
    "E-Commerce": ["SHOPEE", "TIKTOK", "TKPD", "BLIBLI", "LAZADA"],
    "SUKSES JAYA": ["ASEMKA", "TENGSE", "DOMPET"],
    "NAMI": ["NAMI"],
    "BLOOMIE": ["BLOOMIE"],
    "K25": ["K25"],
}


def channel_branch_patterns(channel):
    """Daftar substring branch untuk channel; None bila tak bisa ditarget (OTHER CHANNEL)."""
    return _CHANNEL_PATTERNS.get(channel)


def branch_group(branch):
    """Petakan nilai branch mentah (mis. '1.ASEMKA', '1. ATLAS', '1.NAMI A', NULL) ke channel."""
    if not branch:
        return "OTHER CHANNEL"
    core = re.sub(r"^\d+\.\s*", "", str(branch).strip().upper()).strip()
    if core in _ECOMMERCE:
        return "E-Commerce"
    if core in _SUKSES_JAYA:
        return "SUKSES JAYA"
    if core.startswith("NAMI"):
        return "NAMI"
    if core == "BLOOMIE":
        return "BLOOMIE"
    if core == "K25":
        return "K25"
    return "OTHER CHANNEL"


# --- SlpName yang BUKAN orang (channel/placeholder) ---
NON_PERSON_SLPNAMES = {
    "-NO SALES EMPLOYEE-", "NO SALES EMPLOYEE", "SHOPEE", "TIKTOK", "TOKOPEDIA",
    "BLIBLI", "LAZADA", "WEB", "MARKETPLACE", "-", "",
}


# Kode C yang BUKAN slot salesperson: tak dihitung pencapaian, tak dialarmkan sbg gap.
# Customer di sini BOLEH diberi salesperson sewaktu-waktu (lalu ikut dihitung).
NON_SALES_C = {"NON TRADE", "BLANKS"}


def is_non_sales_c(kode_c):
    return str(kode_c or "").strip().upper() in NON_SALES_C


def is_non_person_slp(slp_name):
    if not slp_name:
        return True
    s = str(slp_name).strip().upper()
    if s in NON_PERSON_SLPNAMES:
        return True
    if s.startswith("-"):        # mis. '-No Sales Employee-'
        return True
    return False
