import pytest

from app import config, ratelimit


@pytest.fixture(autouse=True)
def _no_rate_limit(monkeypatch):
    """기본은 제한 끔 + 상태 초기화. 제한 테스트가 직접 켠다."""
    monkeypatch.setattr(config, "RATE_LIMIT_ASK_PER_MIN", 0)
    monkeypatch.setattr(config, "RATE_LIMIT_TTS_PER_MIN", 0)
    ratelimit.limiter.clear()
