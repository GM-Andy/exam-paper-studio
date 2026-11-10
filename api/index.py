import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.append(str(BASE_DIR))

from main import app as raw_app

class VercelPathRewriteMiddleware:
    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope.get("headers", []))
            header_dict = {}
            for k, v in headers.items():
                k_str = k.decode("latin1").lower() if isinstance(k, bytes) else str(k).lower()
                v_str = v.decode("latin1") if isinstance(v, bytes) else str(v)
                header_dict[k_str] = v_str

            matched_path = header_dict.get("x-matched-path", "")
            current_path = scope.get("path", "")
            
            print(f"[VERCEL ASGI] current_path='{current_path}', x-matched-path='{matched_path}'")

            # If current_path is the serverless rewrite destination, recover original request path
            if matched_path and current_path in ["/api/index.py", "/api", "/api/"]:
                clean_path = matched_path.split("?")[0]
                scope["path"] = clean_path
                scope["raw_path"] = clean_path.encode("latin1")
                print(f"[VERCEL ASGI] Rewrote path to: '{clean_path}'")
            elif current_path.startswith("/api/index.py"):
                clean_path = current_path.replace("/api/index.py", "")
                if not clean_path.startswith("/"):
                    clean_path = "/" + clean_path
                scope["path"] = clean_path
                scope["raw_path"] = clean_path.encode("latin1")
                print(f"[VERCEL ASGI] Stripped index.py to: '{clean_path}'")

        await self.asgi_app(scope, receive, send)

app = VercelPathRewriteMiddleware(raw_app)
