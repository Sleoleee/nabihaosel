from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from routers import upload, overview, customers, products, sales, discounts

app = FastAPI(title="Sales Analytics API")

frontend_url = os.getenv("FRONTEND_URL", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api")
app.include_router(overview.router, prefix="/api/overview")
app.include_router(customers.router, prefix="/api/customers")
app.include_router(products.router, prefix="/api/products")
app.include_router(sales.router, prefix="/api/sales")
app.include_router(discounts.router, prefix="/api/discounts")

@app.get("/")
def root():
    return {"status": "ok"}
