# Sales Analytics Dashboard

Full-stack sales analytics dashboard untuk perusahaan distribusi fashion accessories.

## Tech Stack
- **Frontend**: React + Vite + Recharts (deploy ke Vercel)
- **Backend**: Python FastAPI (deploy ke Railway)
- **Database**: Supabase (PostgreSQL)

## Setup

### 1. Database (Supabase)
Jalankan SQL di `schema.sql` di Supabase SQL Editor.

### 2. Backend
```bash
cd backend
cp .env.example .env
# Isi SUPABASE_URL dan SUPABASE_SERVICE_KEY
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env
# Isi VITE_API_URL (misal: http://localhost:8000)
npm install
npm run dev
```

## Deploy

### Backend → Railway
- Connect repo ke Railway
- Set environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY, FRONTEND_URL)
- Railway akan auto-detect Python dan jalankan uvicorn

### Frontend → Vercel
- Connect repo ke Vercel
- Set root directory ke `frontend`
- Set environment variable: VITE_API_URL ke URL Railway backend

## Fitur
1. **Overview** — KPI cards, revenue trend, bills vs AOV, revenue per kategori & branch
2. **Customer Intelligence** — RFM matrix, tier distribution, customer list, recency
3. **Produk & Kategori** — trend area chart, growth YoY, top 20 produk, heatmap seasonality
4. **Sales Performance** — leaderboard, comparison chart, scatter plot, drilldown per sales
5. **Discount & Pricing** — overview KPI, distribusi diskon, stacked bar monthly, price integrity
6. **Upload Data** — drag & drop Excel, upsert logic, riwayat upload
