import asyncio

from app import config, narrator
from app.models import Place
from app.places import MockPlaces, WikipediaPlaces, get_provider, parse_wikipedia

WIKI = {"query": {"pages": {
    "1": {"pageid": 1, "title": "Colosseum", "coordinates": [{"lat": 41.89, "lon": 12.49}], "extract": "An amphitheatre."},
    "2": {"pageid": 2, "title": "No coords"},
}}}


def test_parse_wikipedia_skips_pages_without_coordinates():
    ps = parse_wikipedia(WIKI)
    assert [p.name for p in ps] == ["Colosseum"] and ps[0].summary == "An amphitheatre."


def test_provider_selection(monkeypatch):
    monkeypatch.setattr(config, "PLACES_PROVIDER", "wikipedia")
    assert isinstance(get_provider(), WikipediaPlaces)
    monkeypatch.setattr(config, "PLACES_PROVIDER", "auto")
    monkeypatch.setattr(config, "GOOGLE_MAPS_API_KEY", "")
    assert isinstance(get_provider(), MockPlaces)


def test_llm_provider_resolution(monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER", "auto")
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    assert narrator.resolve_provider() == "mock"
    monkeypatch.setattr(config, "LLM_PROVIDER", "groq")
    assert narrator.resolve_provider() == "groq"


def test_openai_compat_parsing(monkeypatch):
    class R:
        def raise_for_status(self): pass
        def json(self): return {"choices": [{"message": {"content": " 안녕 "}}]}

    class C:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def post(self, url, json, headers):
            assert "groq" in url and headers["Authorization"] == "Bearer k"
            return R()

    monkeypatch.setattr(narrator.httpx, "AsyncClient", lambda **kw: C())
    monkeypatch.setattr(config, "LLM_API_KEY", "k")
    assert asyncio.run(narrator.narrate_openai_compat("groq", "hi")) == "안녕"
