"""Indian transaction charges for equity delivery trades.

Rates as of 2026 for a discount broker: no brokerage on delivery, STT 0.1% on
both sides, NSE transaction charges, the SEBI fee, stamp duty on buys, GST on
brokerage plus exchange and SEBI charges, and a flat depository charge per
sell. The schema keeps dated rates in ref.charge_rate; these are the defaults
the engine uses until that table is populated.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class DeliveryRates:
    brokerage_pct: float = 0.0
    stt_pct: float = 0.1
    exchange_pct: float = 0.00297
    sebi_per_crore: float = 10.0
    stamp_buy_pct: float = 0.015
    gst_pct: float = 18.0
    dp_per_sell: float = 15.93


DELIVERY = DeliveryRates()


def delivery_charges(turnover: float, side: str, rates: DeliveryRates = DELIVERY) -> float:
    """Total charges in rupees for one delivery order worth `turnover` rupees. `side` is 'B' or 'S'."""
    if turnover <= 0:
        return 0.0
    brokerage = turnover * rates.brokerage_pct / 100
    stt = turnover * rates.stt_pct / 100
    exchange = turnover * rates.exchange_pct / 100
    sebi = turnover * rates.sebi_per_crore / 1e7
    stamp = turnover * rates.stamp_buy_pct / 100 if side == "B" else 0.0
    gst = (brokerage + exchange + sebi) * rates.gst_pct / 100
    dp = rates.dp_per_sell if side == "S" else 0.0
    return round(brokerage + stt + exchange + sebi + stamp + gst + dp, 2)
