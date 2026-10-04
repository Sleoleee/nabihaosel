from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from typing import List
import io

from utils.db import get_client
from utils.parser import parse_excel

router = APIRouter()

CHUNK_SIZE = 200


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), mode: str = "upsert"):
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(400, "Only .xlsx files are supported")

    content = await file.read()
    file_bytes = io.BytesIO(content)

    try:
        parsed = parse_excel(file_bytes)
    except Exception as e:
        raise HTTPException(400, f"Failed to parse file: {str(e)}")

    if not parsed:
        raise HTTPException(400, "No valid 'sales detail YYYY' sheets found in the file")

    db = get_client()
    total_imported = 0
    total_skipped = 0
    years_covered = []

    for year, (records, skipped) in parsed.items():
        years_covered.append(year)
        total_skipped += skipped

        if mode == "replace":
            db.table("transactions").delete().eq("year", year).execute()

        # Insert in chunks
        for i in range(0, len(records), CHUNK_SIZE):
            chunk = records[i:i + CHUNK_SIZE]
            db.table("transactions").insert(chunk).execute()

        total_imported += len(records)

    # Log upload history
    db.table("upload_history").insert({
        "filename": file.filename,
        "rows_imported": total_imported,
        "rows_skipped": total_skipped,
        "years_covered": [str(y) for y in years_covered],
        "replace_mode": mode == "replace",
    }).execute()

    return {
        "imported": total_imported,
        "skipped": total_skipped,
        "years": sorted(years_covered),
    }


@router.get("/upload/check-years")
async def check_years(years: str):
    """Check if data for given years already exists. years = comma-separated"""
    db = get_client()
    year_list = [int(y.strip()) for y in years.split(",") if y.strip().isdigit()]
    existing = []
    for y in year_list:
        res = db.table("transactions").select("year").eq("year", y).limit(1).execute()
        if res.data:
            existing.append(y)
    return {"existing_years": existing}


@router.get("/upload/history")
async def upload_history():
    db = get_client()
    res = db.table("upload_history").select("*").order("uploaded_at", desc=True).execute()
    return res.data


@router.get("/upload/channel-status")
async def channel_status():
    """Tanggal (bulan) terakhir berdata per channel — dari agg_category_month (ringan)."""
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import config
    db = get_client()
    rows = db.table("agg_category_month").select("tahun,bulan,channel").limit(1000000).execute().data or []
    latest = {}
    for r in rows:
        ch = r.get("channel") or "OTHER CHANNEL"
        ym = (int(r.get("tahun") or 0), int(r.get("bulan") or 0))
        if ch not in latest or ym > latest[ch]:
            latest[ch] = ym
    MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]
    out = []
    for ch in config.BRANCH_GROUP_ORDER:
        if ch in latest:
            y, m = latest[ch]
            out.append({"channel": ch, "tahun": y, "bulan": m,
                        "label": f"{MONTHS[m-1]} {y}" if 1 <= m <= 12 else str(y)})
        else:
            out.append({"channel": ch, "tahun": None, "bulan": None, "label": "— tidak ada data —"})
    return {"channels": out}


@router.post("/upload/delete")
async def delete_data(payload: dict):
    """Hapus transaksi by channel + rentang tanggal/tahun. DESTRUKTIF.
    body: {channel: 'all'|<channel>, year?: int, date_from?: 'YYYY-MM-DD', date_to?: 'YYYY-MM-DD', confirm: true}
    Setelah ini, agregat (agg_*) WAJIB di-rebuild (build_analytics.py)."""
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import config
    if not payload.get("confirm"):
        raise HTTPException(400, "Konfirmasi diperlukan (confirm=true).")
    channel = (payload.get("channel") or "all").strip()
    year = payload.get("year")
    date_from = payload.get("date_from")
    date_to = payload.get("date_to")
    if channel != "all" and config.channel_branch_patterns(channel) is None:
        raise HTTPException(400, f"Channel '{channel}' tak bisa ditarget hapus (OTHER CHANNEL). Pakai filter tahun/tanggal + 'all', atau hapus per channel lain.")

    db = get_client()
    q = db.table("transactions").delete()
    if year:
        q = q.eq("year", int(year))
    if date_from:
        q = q.gte("posting_date", date_from)
    if date_to:
        q = q.lte("posting_date", date_to)
    if channel != "all":
        pats = config.channel_branch_patterns(channel)
        q = q.or_(",".join(f"branch.ilike.%{p}%" for p in pats))
    res = q.execute()
    deleted = len(res.data or [])
    return {"ok": True, "deleted": deleted, "channel": channel, "year": year,
            "note": "Agregat kini basi — jalankan build_analytics.py (lalu build_territory.py bila perlu) untuk menyinkronkan dashboard."}
