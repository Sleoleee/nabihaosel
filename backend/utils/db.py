import os
from supabase import create_client, Client

try:
    from supabase.client import ClientOptions
except Exception:  # nama modul berbeda antar versi
    try:
        from supabase.lib.client_options import ClientOptions
    except Exception:
        ClientOptions = None

_client: Client = None

def get_client() -> Client:
    global _client
    if _client is None:
        url = (os.getenv("SUPABASE_URL") or "").strip().strip('"').strip("'").rstrip("/")
        key = (os.getenv("SUPABASE_SERVICE_KEY") or "").strip().strip('"').strip("'")
        # URL harus 'https://<ref>.supabase.co' (Project URL di Settings -> API),
        # BUKAN URL dashboard 'https://supabase.com/dashboard/project/<ref>'.
        if "/dashboard/" in url or url.endswith("supabase.com"):
            raise SystemExit(
                f"SUPABASE_URL salah: '{url}'.\n"
                "Pakai Project URL dari Supabase Settings -> API, format: https://<ref>.supabase.co"
            )
        # timeout eksplisit: socket yang nge-hang -> error yang bisa di-retry, bukan freeze.
        if ClientOptions is not None:
            try:
                _client = create_client(url, key, options=ClientOptions(postgrest_client_timeout=120))
                return _client
            except Exception:
                pass
        _client = create_client(url, key)
    return _client
