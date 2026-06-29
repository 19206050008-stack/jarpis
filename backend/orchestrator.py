"""LangChain-style tool orchestrator for the flowchart.

ponytail: keep LangChain optional; the app must still boot if Railway install/cache lags.
"""

try:
    from langchain.tools import tool
except Exception:  # pragma: no cover
    def tool(fn):
        fn.name = fn.__name__
        return fn


@tool
def web_search(query: str) -> str:
    """Search public web/news/marketplace information."""
    return query


@tool
def calendar(query: str) -> str:
    """Read or create Google Calendar events."""
    return query


@tool
def spotify(query: str) -> str:
    """Control Spotify playback and current track."""
    return query


@tool
def memory(query: str) -> str:
    """Read or write assistant memory."""
    return query


TOOLS = [web_search, calendar, spotify, memory]


def plan_task(message: str) -> str:
    lower = message.lower()
    if lower.startswith(("ingat ", "simpan memori")):
        return "memory"
    if any(x in lower for x in ["kalender", "jadwal", "calendar"]):
        return "calendar"
    if any(x in lower for x in ["cari video", "video ", "youtube"]):
        return "video_search"
    if any(x in lower for x in ["cari gambar", "gambar ", "foto "]):
        return "image_search"
    if "spotify" in lower or any(x in lower for x in ["putar lagu", "pause lagu", "lagu "]):
        return "spotify"
    if any(x in lower for x in ["harga", "marketplace", "shopee", "tokopedia", "tcg"]):
        return "marketplace"
    if any(x in lower for x in ["berita", "artikel"]):
        return "news"
    if any(x in lower for x in ["cari ", "search ", "googling"]):
        return "web_search"
    return "chat"
