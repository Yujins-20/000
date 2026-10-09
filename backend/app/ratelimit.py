"""IP별 요청 횟수 제한(슬라이딩 윈도우, 단일 프로세스 메모리). GPU를 쓰는 엔드포인트 남용 방지용.
다중 인스턴스/정식 공개에서는 Redis 기반 제한과 사용자 인증으로 교체할 것."""
import time
from collections import deque

from fastapi import HTTPException, Request

from . import config

_LOOPBACK = {"127.0.0.1", "::1", "localhost"}


def client_ip(request: Request) -> str:
    """터널(cloudflared)은 로컬 루프백으로 접속하므로, 피어가 루프백일 때만 전달 헤더를 신뢰한다.
    (외부에서 직접 붙은 요청이 헤더를 위조해 제한을 피하거나 남에게 덮어씌우는 것을 막는다.)"""
    peer = request.client.host if request.client else "unknown"
    if peer in _LOOPBACK:
        fwd = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if fwd:
            return fwd
    return peer


class SlidingWindow:
    def __init__(self, window_s: float = 60.0, max_keys: int = 10000):
        self.window, self.max_keys, self.hits = window_s, max_keys, {}

    def check(self, key: str, limit: int, now: float | None = None) -> float:
        """허용이면 0, 초과면 다시 시도할 때까지 남은 초."""
        now = time.monotonic() if now is None else now
        q = self.hits.setdefault(key, deque())
        while q and q[0] <= now - self.window:
            q.popleft()
        if len(q) >= limit:
            return max(1.0, q[0] + self.window - now)
        q.append(now)
        if len(self.hits) > self.max_keys:  # 오래된 키 정리(메모리 보호)
            for k in [k for k, v in self.hits.items() if not v or v[-1] <= now - self.window]:
                del self.hits[k]
        return 0.0

    def clear(self):
        self.hits.clear()


limiter = SlidingWindow()


def _limit(group: str, per_min: int, request: Request):
    if per_min <= 0:  # 0 = 비활성
        return
    wait = limiter.check(f"{group}:{client_ip(request)}", per_min)
    if wait:
        raise HTTPException(429, "too many requests", headers={"Retry-After": str(int(wait))})


def limit_ask(request: Request):
    _limit("ask", config.RATE_LIMIT_ASK_PER_MIN, request)


def limit_tts(request: Request):
    _limit("tts", config.RATE_LIMIT_TTS_PER_MIN, request)


def limit_feedback(request: Request):
    _limit("feedback", config.RATE_LIMIT_FEEDBACK_PER_MIN, request)
