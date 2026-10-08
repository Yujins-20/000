"""단순 인메모리 TTL 캐시. (운영에서는 Redis/SQLite로 교체)"""
import time


class TTLCache:
    def __init__(self, ttl_s: int = 7 * 24 * 3600, max_items: int = 5000):
        self.ttl, self.max, self._d = ttl_s, max_items, {}

    def get(self, key):
        v = self._d.get(key)
        if v and v[0] > time.time():
            return v[1]
        self._d.pop(key, None)

    def set(self, key, value):
        if len(self._d) >= self.max:
            self._d.pop(next(iter(self._d)))
        self._d[key] = (time.time() + self.ttl, value)
