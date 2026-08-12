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
MIN_YEAR = 2023                     # abaikan data < 2023

# --- Ambang lifecycle customer ---
LOST_MULTIPLIER = 3                 # tidak beli >= 3x interval normal => Lost
REACTIVATE_MULTIPLIER = 2          # sempat tidak aktif >= 2x interval lalu beli lagi => Reactivated

# --- Kategori non-produk (biaya/pelengkap) ---
NON_CORE_CATEGORIES = {"MARKETPLACE", "BIAYA PACKAGING", "TAS PAPERBAG"}


_NON_CORE_UPPER = {c.upper() for c in NON_CORE_CATEGORIES}


def is_produk_inti(kategori):
    """FALSE untuk kategori non-produk (MARKETPLACE / BIAYA PACKAGING / TAS PAPERBAG)."""
    return (str(kategori).strip().upper() if kategori else "") not in _NON_CORE_UPPER


# --- Pemetaan branch -> channel (6 kelompok) ---
BRANCH_GROUP_ORDER = ["E-Commerce", "SUKSES JAYA", "NAMI", "BLOOMIE", "K25", "OTHER CHANNEL"]
CORE_BRANCH = "1.K25"
_ECOMMERCE   = {"SHOPEE", "TIKTOK", "TKPD", "BLIBLI", "LAZADA"}
_SUKSES_JAYA = {"ASEMKA", "TENGSE", "DOMPET"}


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


def is_non_person_slp(slp_name):
    if not slp_name:
        return True
    s = str(slp_name).strip().upper()
    if s in NON_PERSON_SLPNAMES:
        return True
    if s.startswith("-"):        # mis. '-No Sales Employee-'
        return True
    return False
