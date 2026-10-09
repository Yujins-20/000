"""자체 호스팅 VLM(OpenAI 호환 Chat Completions) 클라이언트. 텍스트·이미지 공용."""
import re

import httpx

from .streaming import ThinkFilter, sse_deltas

from . import config

_THINK = re.compile(r"<think>.*?(</think>|$)", re.S)


def configured() -> bool:
    return bool(config.VLM_BASE_URL and config.VLM_API_KEY)


def clean(text: str) -> str:
    """추론 모델이 섞어 내보낼 수 있는 <think> 블록 제거."""
    return _THINK.sub("", text).strip()


def build_body(messages: list[dict], max_tokens: int, temperature: float, stream: bool = False) -> dict:
    body = {
        "model": config.VLM_MODEL, "messages": messages, "max_tokens": max_tokens, "temperature": temperature,
        # vLLM 서버가 chat template 인자로 추론 강도를 받는다 (서버 사양 예시와 동일한 방식)
        "chat_template_kwargs": {"reasoning_effort": config.VLM_REASONING_EFFORT},
    }
    if stream:
        body["stream"] = True
    return body


async def chat(messages: list[dict], max_tokens: int = 500, temperature: float = 0.7) -> str:
    url = config.VLM_BASE_URL.rstrip("/") + "/chat/completions"
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(url, json=build_body(messages, max_tokens, temperature),
                         headers={"Authorization": f"Bearer {config.VLM_API_KEY}"})
        r.raise_for_status()
    return clean(r.json()["choices"][0]["message"].get("content") or "")


async def stream(messages: list[dict], max_tokens: int = 500, temperature: float = 0.7):
    """content 델타를 순서대로 yield (<think> 제거됨)."""
    url = config.VLM_BASE_URL.rstrip("/") + "/chat/completions"
    flt = ThinkFilter()
    async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=10)) as c:
        async with c.stream("POST", url, json=build_body(messages, max_tokens, temperature, stream=True),
                            headers={"Authorization": f"Bearer {config.VLM_API_KEY}"}) as r:
            r.raise_for_status()
            async for d in sse_deltas(r):
                if t := flt.feed(d):
                    yield t
    if t := flt.flush():
        yield t
