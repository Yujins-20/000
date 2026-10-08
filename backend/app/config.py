import os

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
DEFAULT_RADIUS_M = int(os.getenv("DEFAULT_RADIUS_M", "150"))

# 장소 공급자: auto(키 있으면 google, 없으면 mock) | google | wikipedia | mock
PLACES_PROVIDER = os.getenv("PLACES_PROVIDER", "auto")
WIKI_LANG = os.getenv("WIKI_LANG", "en")

# LLM 공급자: auto(GEMINI 키 있으면 gemini, 없으면 mock) | gemini | groq | openrouter | mock
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")  # groq/openrouter 용
LLM_MODEL = os.getenv("LLM_MODEL", "")
OPENAI_COMPAT = {  # OpenAI 호환 Chat Completions 엔드포인트 (무료 티어 있음)
    "groq": ("https://api.groq.com/openai/v1/chat/completions", "llama-3.3-70b-versatile"),
    "openrouter": ("https://openrouter.ai/api/v1/chat/completions", "meta-llama/llama-3.3-70b-instruct:free"),
}
