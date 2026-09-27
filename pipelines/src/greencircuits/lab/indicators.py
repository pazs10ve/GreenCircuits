"""Indicators on daily closes. Every function returns an array aligned to its input,
with NaN until there is enough history, so a signal can never look ahead.

Series can start with NaN (an instrument listed after the calendar begins); each
indicator is computed from the first real value on, so a leading gap never
poisons what follows.
"""

from collections.abc import Callable

import numpy as np


def _on_valid(x: np.ndarray, fn: Callable[[np.ndarray], np.ndarray]) -> np.ndarray:
    """Apply fn to the part of x after its leading NaNs and put the result back in place."""
    valid = np.flatnonzero(~np.isnan(x))
    out = np.full(len(x), np.nan)
    if len(valid) == 0:
        return out
    first = valid[0]
    out[first:] = fn(x[first:])
    return out


def sma(x: np.ndarray, n: int) -> np.ndarray:
    return _on_valid(x, lambda y: _sma(y, n))


def _sma(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(len(x), np.nan)
    if len(x) < n:
        return out
    c = np.cumsum(np.insert(x, 0, 0.0))
    out[n - 1 :] = (c[n:] - c[:-n]) / n
    return out


def ema(x: np.ndarray, n: int) -> np.ndarray:
    return _on_valid(x, lambda y: _ema(y, n))


def _ema(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(len(x), np.nan)
    if len(x) < n:
        return out
    k = 2 / (n + 1)
    out[n - 1] = x[:n].mean()
    for i in range(n, len(x)):
        out[i] = x[i] * k + out[i - 1] * (1 - k)
    return out


def rsi(x: np.ndarray, n: int = 14) -> np.ndarray:
    """Wilder's RSI."""
    return _on_valid(x, lambda y: _rsi(y, n))


def _rsi(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(len(x), np.nan)
    if len(x) <= n:
        return out
    d = np.diff(x)
    gain = np.where(d > 0, d, 0.0)
    loss = np.where(d < 0, -d, 0.0)
    g = gain[:n].mean()
    l = loss[:n].mean()
    out[n] = 100.0 if l == 0 else 100 - 100 / (1 + g / l)
    for i in range(n + 1, len(x)):
        g = (g * (n - 1) + gain[i - 1]) / n
        l = (l * (n - 1) + loss[i - 1]) / n
        out[i] = 100.0 if l == 0 else 100 - 100 / (1 + g / l)
    return out


def rolling_max(x: np.ndarray, n: int) -> np.ndarray:
    """Highest value of the previous n bars, excluding the current one (a breakout compares against it)."""
    return _on_valid(x, lambda y: _rolling_max(y, n))


def _rolling_max(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(len(x), np.nan)
    for i in range(n, len(x)):
        out[i] = x[i - n : i].max()
    return out


def rolling_min(x: np.ndarray, n: int) -> np.ndarray:
    return _on_valid(x, lambda y: _rolling_min(y, n))


def _rolling_min(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(len(x), np.nan)
    for i in range(n, len(x)):
        out[i] = x[i - n : i].min()
    return out
