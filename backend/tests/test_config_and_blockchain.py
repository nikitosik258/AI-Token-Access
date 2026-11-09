from __future__ import annotations

import pytest

from backend.blockchain import format_token_amount
from backend.config import Settings


def test_settings_reject_localhost_aliases():
    with pytest.raises(ValueError):
        Settings(frontend_origin="http://localhost:5173").validate()


def test_token_formatting_uses_integer_math():
    assert format_token_amount(100 * 10**18, 18) == "100"
    assert format_token_amount(1_500_000_000_000_000_000, 18) == "1.5"
