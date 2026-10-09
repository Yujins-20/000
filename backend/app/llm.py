"""공급자 중립 LLM 호출. messages = [{"role": system|user|assistant, "content": str}, ...] (멀티턴)."""
import httpx

from . import config, vlm
from .streaming import sse_deltas


def resolve_provider() -> str:
    p = config.LLM_PROVIDER
    if p == "auto":
        if vlm.configured():
            return "vlm"
        return "gemini" if config.GEMINI_API_KEY else "mock"
    return p


def _oai_request(provider: str, messages: list[dict], max_tokens: int, stream: bool):
    url, default_model = config.OPENAI_COMPAT[provider]
    body = {"model": config.LLM_MODEL or default_model, "temperature": 0.8, "max_tokens": max_tokens,
            "messages": messages}
    if stream:
        body["stream"] = True
    return url, body, {"Authorization": f"Bearer {config.LLM_API_KEY}"}


async def _oai_complete(provider: str, messages: list[dict], max_tokens: int) -> str:
    url, body, headers = _oai_request(provider, messages, max_tokens, False)
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(url, json=body, headers=headers)
        r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()


async def _oai_stream(provider: str, messages: list[dict], max_tokens: int):
    url, body, headers = _oai_request(provider, messages, max_tokens, True)
    async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=10)) as c:
        async with c.stream("POST", url, json=body, headers=headers) as r:
            r.raise_for_status()
            async for d in sse_deltas(r):
                yield d


def gemini_payload(messages: list[dict], max_tokens: int) -> dict:
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                for m in messages if m["role"] != "system"]
    body = {"contents": contents, "generationConfig": {"temperature": 0.8, "maxOutputTokens": max_tokens}}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    return body


async def _gemini_complete(messages: list[dict], max_tokens: int) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_MODEL}:generateContent"
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(url, json=gemini_payload(messages, max_tokens), headers={"x-goog-api-key": config.GEMINI_API_KEY})
        r.raise_for_status()
    return "".join(p.get("text", "") for p in r.json()["candidates"][0]["content"]["parts"]).strip()


async def complete(messages: list[dict], max_tokens: int = 1200) -> str:
    p = resolve_provider()
    if p == "vlm":
        return await vlm.chat(messages, max_tokens=max_tokens)
    if p in config.OPENAI_COMPAT:
        return await _oai_complete(p, messages, max_tokens)
    if p == "gemini":
        return await _gemini_complete(messages, max_tokens)
    raise RuntimeError("no LLM provider configured")


async def stream(messages: list[dict], max_tokens: int = 1200):
    p = resolve_provider()
    if p == "vlm":
        async for d in vlm.stream(messages, max_tokens=max_tokens):
            yield d
    elif p in config.OPENAI_COMPAT:
        async for d in _oai_stream(p, messages, max_tokens):
            yield d
    elif p == "gemini":  # 비스트리밍 폴백: 통째로 한 번에
        yield await _gemini_complete(messages, max_tokens)
    else:
        raise RuntimeError("no LLM provider configured")
