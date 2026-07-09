CHANNEL_NAMES = [
    '-No Sales Employee-', 'Shopee', 'TikTok', 'Tokopedia',
    'Blibli', 'Whatsapp', 'Anonym'
]


def get_customer_tier(avg_monthly_spend: float) -> str:
    if avg_monthly_spend >= 30_000_000:   return "Tier 1 — ≥30jt"
    elif avg_monthly_spend >= 20_000_000: return "Tier 2 — 20–30jt"
    elif avg_monthly_spend >= 15_000_000: return "Tier 3 — 15–20jt"
    elif avg_monthly_spend >= 10_000_000: return "Tier 4 — 10–15jt"
    elif avg_monthly_spend >= 7_000_000:  return "Tier 5 — 7–10jt"
    elif avg_monthly_spend >= 6_000_000:  return "Tier 6 — 6–7jt"
    elif avg_monthly_spend >= 5_000_000:  return "Tier 7 — 5–6jt"
    elif avg_monthly_spend >= 4_000_000:  return "Tier 8 — 4–5jt"
    elif avg_monthly_spend >= 3_000_000:  return "Tier 9 — 3–4jt"
    elif avg_monthly_spend >= 2_000_000:  return "Tier 10 — 2–3jt"
    elif avg_monthly_spend >= 1_000_000:  return "Tier 11 — 1–2jt"
    elif avg_monthly_spend >= 500_000:    return "Tier 12 — 500rb–1jt"
    else:                                 return "Tier 13 — <500rb"
