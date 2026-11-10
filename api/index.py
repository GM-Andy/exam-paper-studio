import sys
import urllib.parse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.append(str(BASE_DIR))

from main import app as raw_app

class VercelPathRewriteMiddleware:
    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            current_path = scope.get("path", "")
            query_bytes = scope.get("query_string", b"")
            query_str = query_bytes.decode("latin1")
            
            # 1. Check for __path parameter passed from vercel.json rewrite
            params = urllib.parse.parse_qs(query_str)
            if "__path" in params and params["__path"]:
                extracted = params["__path"][0].lstrip("/")
                target_path = "/" + extracted
                
                # Reconstruct query string without __path parameter
                clean_params = [(k, v) for k, vs in params.items() if k != "__path" for v in vs]
                new_query = urllib.parse.urlencode(clean_params)
                
                scope["path"] = target_path
                scope["raw_path"] = target_path.encode("latin1")
                scope["query_string"] = new_query.encode("latin1")
                print(f"[VERCEL ASGI] Rewrite __path='{extracted}' -> target_path='{target_path}', query='{new_query}'")
            elif current_path in ["/api/index.py", "/api", "/api/"]:
                # Fallback to health endpoint
                scope["path"] = "/health"
                scope["raw_path"] = b"/health"

        await self.asgi_app(scope, receive, send)

app = VercelPathRewriteMiddleware(raw_app)
