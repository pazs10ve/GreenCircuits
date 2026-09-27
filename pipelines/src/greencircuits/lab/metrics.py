"""Return and risk metrics for backtest reports."""

from datetime import date

import numpy as np

TRADING_DAYS = 252
RISK_FREE = 0.065  # annual, roughly the 1-year T-bill


def cagr(start_value: float, end_value: float, years: float) -> float:
    if start_value <= 0 or end_value <= 0 or years <= 0:
        return 0.0
    return (end_value / start_value) ** (1 / years) - 1


def max_drawdown(values: np.ndarray) -> float:
    """Largest peak-to-trough fall, as a negative fraction."""
    peaks = np.maximum.accumulate(values)
    return float(np.min(values / peaks - 1)) if len(values) else 0.0


def drawdown_series(values: np.ndarray) -> np.ndarray:
    return values / np.maximum.accumulate(values) - 1


def summarise(daily_returns: np.ndarray, dates: list[date]) -> dict[str, float]:
    """CAGR, volatility, Sharpe, Sortino, max drawdown and Calmar from time-weighted daily returns."""
    if len(daily_returns) < 2:
        return {
            "cagr": 0.0,
            "volatility": 0.0,
            "sharpe": 0.0,
            "sortino": 0.0,
            "max_drawdown": 0.0,
            "calmar": 0.0,
        }
    growth = np.cumprod(1 + daily_returns)
    years = max((dates[-1] - dates[0]).days / 365.25, 1 / 365)
    c = growth[-1] ** (1 / years) - 1
    rf = RISK_FREE / TRADING_DAYS
    excess = daily_returns - rf
    vol = float(np.std(daily_returns, ddof=1) * np.sqrt(TRADING_DAYS))
    downside = np.sqrt(np.mean(np.minimum(excess, 0) ** 2)) * np.sqrt(TRADING_DAYS)
    sharpe = float(np.mean(excess) * TRADING_DAYS / vol) if vol > 0 else 0.0
    sortino = float(np.mean(excess) * TRADING_DAYS / downside) if downside > 0 else 0.0
    mdd = max_drawdown(np.concatenate([[1.0], growth]))
    return {
        "cagr": float(c),
        "volatility": vol,
        "sharpe": sharpe,
        "sortino": sortino,
        "max_drawdown": mdd,
        "calmar": float(c / abs(mdd)) if mdd < 0 else 0.0,
    }


def monthly_returns(daily_returns: np.ndarray, dates: list[date]) -> dict[str, float]:
    """{"2024-01": 0.021, ...} compounded from time-weighted daily returns."""
    out: dict[str, float] = {}
    for r, d in zip(daily_returns, dates):
        key = f"{d.year}-{d.month:02d}"
        out[key] = (1 + out.get(key, 0.0)) * (1 + r) - 1
    return {k: round(v, 6) for k, v in out.items()}


def xirr(flows: list[tuple[date, float]]) -> float:
    """Annualised internal rate of return for dated cash flows (money in negative)."""
    if len(flows) < 2:
        return 0.0
    t0 = flows[0][0]
    years = np.array([(d - t0).days / 365.0 for d, _ in flows])
    amounts = np.array([a for _, a in flows])

    def npv(r: float) -> float:
        return float(np.sum(amounts / (1 + r) ** years))

    lo, hi = -0.99, 10.0
    if npv(lo) * npv(hi) > 0:
        return 0.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(mid) > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def downsample(n: int, limit: int = 2000) -> list[int]:
    """Indices that keep at most `limit` points, always including the last."""
    if n <= limit:
        return list(range(n))
    step = n / limit
    idx = sorted({int(i * step) for i in range(limit)} | {n - 1})
    return idx
