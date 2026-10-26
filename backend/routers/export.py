"""
Report Center — endpoint export file Excel.
  GET /api/export/salesperson?dari=2026-01&sampai=2026-09&channel=K25,NAMI
Mengembalikan file .xlsx (StreamingResponse). File lain (customer/product/kpi) menyusul.
"""
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Optional
import io

from utils.db import get_client

router = APIRouter()

# Channel yang biasanya ada; dipakai untuk peringatan cakupan bila kosong di periode.
_ALL_CHANNELS = ["E-Commerce", "SUKSES JAYA", "NAMI", "BLOOMIE", "K25", "OTHER CHANNEL"]


def _coverage_warnings(db, dari, sampai, channels):
    """Peringatan bila channel yang dipilih tak punya transaksi di sebagian periode."""
    from reports.salesperson import _period_months
    months = _period_months(dari, sampai)
    years = sorted({y for y, _ in months})
    rows = db.table("agg_salesperson_customer_month").select("channel,tahun,bulan").in_(
        "tahun", years).limit(1000000).execute().data or []
    present = {(r["channel"], int(r["tahun"]), int(r["bulan"])) for r in rows}
    check = channels or _ALL_CHANNELS
    warn = []
    for ch in check:
        missing = [f"{y}-{m:02d}" for (y, m) in months if (ch, y, m) not in present]
        if missing and len(missing) < len(months):
            warn.append(f"Data channel {ch} belum lengkap: tidak ada transaksi pada {', '.join(missing)}.")
        elif missing and len(missing) == len(months):
            warn.append(f"Data channel {ch} untuk periode ini belum masuk.")
    return warn


@router.get("/salesperson")
def export_salesperson(dari: str = Query(..., description="YYYY-MM"),
                       sampai: str = Query(..., description="YYYY-MM"),
                       channel: Optional[str] = Query(None, description="pisah koma; kosong=semua")):
    from reports import salesperson as rpt
    db = get_client()
    channels = [c.strip() for c in channel.split(",") if c.strip()] if channel else None
    warns = _coverage_warnings(db, dari, sampai, channels)
    data = rpt.build(db, dari, sampai, channels=channels, coverage_warnings=warns)
    if len(data) > 4_400_000:
        return JSONResponse(status_code=413, content={"error": "File terlalu besar (>4.4MB). Persempit periode/channel."})
    return _xlsx_response(data, f"Salesperson_Performance_{dari}_sd_{sampai}.xlsx")


@router.get("/customer")
def export_customer(dari: str = Query(..., description="YYYY-MM"),
                    sampai: str = Query(..., description="YYYY-MM"),
                    channel: Optional[str] = Query(None)):
    from reports import customer as rpt
    db = get_client()
    channels = [c.strip() for c in channel.split(",") if c.strip()] if channel else None
    warns = _coverage_warnings(db, dari, sampai, channels)
    data = rpt.build(db, dari, sampai, channels=channels, coverage_warnings=warns)
    if len(data) > 4_400_000:
        return JSONResponse(status_code=413, content={"error": "File terlalu besar. Persempit periode/channel."})
    return _xlsx_response(data, f"Customer_Performance_{dari}_sd_{sampai}.xlsx")


@router.get("/product")
def export_product(dari: str = Query(..., description="YYYY-MM"),
                   sampai: str = Query(..., description="YYYY-MM"),
                   channel: Optional[str] = Query(None),
                   produk_inti: bool = Query(True)):
    from reports import product as rpt
    db = get_client()
    channels = [c.strip() for c in channel.split(",") if c.strip()] if channel else None
    warns = _coverage_warnings(db, dari, sampai, channels)
    data = rpt.build(db, dari, sampai, channels=channels, produk_inti=produk_inti, coverage_warnings=warns)
    if len(data) > 4_400_000:
        return JSONResponse(status_code=413, content={"error": "File terlalu besar. Persempit periode/channel."})
    return _xlsx_response(data, f"Product_Performance_{dari}_sd_{sampai}.xlsx")


@router.get("/kpi")
def export_kpi(bulan: str = Query(..., description="YYYY-MM bulan penilaian"),
               manager: str = Query("both", description="branding | commerce | both")):
    from reports import kpi as rpt
    db = get_client()
    data = rpt.build(db, bulan, manager=manager)
    return _xlsx_response(data, f"KPI_Manager_{bulan}.xlsx")


def _xlsx_response(data, fname):
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'})
