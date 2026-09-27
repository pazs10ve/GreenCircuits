import json

from greencircuits.lab import parity


def test_golden_file_matches_the_engine():
    """If this fails after an engine change, run `python -m greencircuits.lab.parity --write`
    and update the TypeScript engine (packages/backtest) until its tests pass too."""
    expected = json.loads((parity.FIXTURES / "expected.json").read_text(encoding="utf-8"))
    assert parity.differences(parity.compute(), expected) == []
