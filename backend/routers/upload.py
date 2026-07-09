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
