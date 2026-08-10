"""Entry point serverless untuk Vercel.
Semua request diarahkan ke sini (lihat vercel.json), lalu ditangani FastAPI.
"""
import os
import sys

# Pastikan root folder backend ada di sys.path agar `main`, `routers`, `utils` terbaca
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: E402  (FastAPI ASGI app yang dijalankan Vercel)
