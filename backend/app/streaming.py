"""스트리밍 유틸: <think> 제거, SSE 델타 파싱, 문장 단위 청킹(첫 문장을 빨리 TTS로 보내기 위함)."""
import json
import re


class ThinkFilter:
    """스트림 조각 경계에 걸친 <think>…</think> 블록을 제거한다."""
    OPEN, CLOSE = "<think>", "</think>"

    def __init__(self):
        self.buf, self.inside = "", False

    def feed(self, s: str) -> str:
        self.buf += s
        out = []
        while True:
            tag = self.CLOSE if self.inside else self.OPEN
            i = self.buf.find(tag)
            if i >= 0:
                if not self.inside:
                    out.append(self.buf[:i])
                self.buf = self.buf[i + len(tag):]
                self.inside = not self.inside
                continue
            keep = next((k for k in range(min(len(tag) - 1, len(self.buf)), 0, -1) if tag.startswith(self.buf[-k:])), 0)
            if not self.inside:
                out.append(self.buf[:len(self.buf) - keep])
            self.buf = self.buf[len(self.buf) - keep:]
            return "".join(out)

    def flush(self) -> str:
        r = "" if self.inside else self.buf
        self.buf = ""
        return r


async def sse_deltas(response):
    """OpenAI 호환 SSE(`data: {...}` / `data: [DONE]`)에서 content 델타만 뽑는다."""
    async for line in response.aiter_lines():
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if data == "[DONE]":
            return
        try:
            delta = json.loads(data)["choices"][0].get("delta", {})
        except (ValueError, KeyError, IndexError):
            continue
        if delta.get("content"):
            yield delta["content"]


_END = re.compile(r"([.!?。…]+[\"”’)\]]*)\s+")


class SentenceChunker:
    """델타를 받아 '완성된 문장'만 내보낸다. 너무 짧은 문장은 다음 문장과 합쳐 TTS 끊김을 줄인다."""

    def __init__(self, min_len: int = 14, max_len: int = 300):
        self.buf, self.min, self.max = "", min_len, max_len

    def feed(self, s: str) -> list[str]:
        self.buf += s
        out = []
        while True:
            m = next((m for m in _END.finditer(self.buf) if m.end(1) >= self.min), None)
            if m:
                out.append(self.buf[:m.end(1)].strip())
                self.buf = self.buf[m.end():]
            elif len(self.buf) > self.max:  # 구두점 없이 길어지면 강제 분할(TTS 길이 제한 보호)
                cut = max(self.buf.rfind(", ", 0, self.max), self.buf.rfind(" ", 0, self.max), self.max // 2)
                out.append(self.buf[:cut + 1].strip())
                self.buf = self.buf[cut + 1:]
            else:
                return out

    def flush(self) -> list[str]:
        r, self.buf = self.buf.strip(), ""
        return [r] if r else []
