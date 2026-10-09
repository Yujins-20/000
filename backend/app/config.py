import os

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
DEFAULT_RADIUS_M = int(os.getenv("DEFAULT_RADIUS_M", "150"))

# 장소 공급자: auto(키 있으면 google, 없으면 mock) | google | wikipedia | mock
PLACES_PROVIDER = os.getenv("PLACES_PROVIDER", "auto")
WIKI_LANG = os.getenv("WIKI_LANG", "en")

# LLM 공급자: auto(vlm 설정 > gemini 키 > mock) | vlm | gemini | groq | openrouter | mock
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")  # groq/openrouter 용
LLM_MODEL = os.getenv("LLM_MODEL", "")
OPENAI_COMPAT = {  # OpenAI 호환 Chat Completions 엔드포인트 (무료 티어 있음)
    "groq": ("https://api.groq.com/openai/v1/chat/completions", "llama-3.3-70b-versatile"),
    "openrouter": ("https://openrouter.ai/api/v1/chat/completions", "meta-llama/llama-3.3-70b-instruct:free"),
}

# ---- 자체 호스팅 VLM (OpenAI 호환, 예: vLLM + Qwen) ----
# 키는 반드시 환경변수/비밀관리로만 주입한다. 저장소·프런트엔드·로그에 넣지 말 것.
VLM_BASE_URL = os.getenv("VLM_BASE_URL", "")            # 예: https://xxxx.trycloudflare.com/v1
VLM_API_KEY = os.getenv("VLM_API_KEY", "")
VLM_MODEL = os.getenv("VLM_MODEL", "qwen3.8-vl")
VLM_REASONING_EFFORT = os.getenv("VLM_REASONING_EFFORT", "low")  # 해설은 지연이 중요 → low 기본

# ---- 자체 호스팅 TTS (OpenAI 호환 /v1/audio/speech, 예: vLLM-Omni + Qwen3-TTS) ----
TTS_BASE_URL = os.getenv("TTS_BASE_URL", "")            # 예: http://127.0.0.1:8001/v1
TTS_API_KEY = os.getenv("TTS_API_KEY", "")
TTS_MODEL = os.getenv("TTS_MODEL", "")
TTS_VOICE = os.getenv("TTS_VOICE", "")
TTS_FORMAT = os.getenv("TTS_FORMAT", "mp3")            # mp3 | wav
TTS_CACHE_DIR = os.getenv("TTS_CACHE_DIR", ".tts_cache")
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(4 * 1024 * 1024)))
MAX_TTS_CHARS = int(os.getenv("MAX_TTS_CHARS", "600"))

# 프런트엔드를 다른 도메인에서 서빙할 때만 설정 (쉼표 구분, "*" 허용). 같은 도메인이면 비워 둔다.
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "")
