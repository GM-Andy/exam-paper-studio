import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

# In Vercel serverless / AWS Lambda, /var/task is read-only; /tmp is writable
if os.environ.get("VERCEL"):
    UPLOADS_DIR = Path("/tmp") / "uploads"
    OUTPUT_DIR = Path("/tmp") / "output"
else:
    UPLOADS_DIR = BASE_DIR / "uploads"
    OUTPUT_DIR = BASE_DIR / "output"

TEMPLATES_DIR = BASE_DIR / "templates"

try:
    UPLOADS_DIR.mkdir(exist_ok=True, parents=True)
    OUTPUT_DIR.mkdir(exist_ok=True, parents=True)
except Exception as e:
    print(f"Directory create warning: {e}")

try:
    TEMPLATES_DIR.mkdir(exist_ok=True, parents=True)
except Exception:
    pass

# API & Model Configuration
OPENCODE_API_KEY = os.getenv("OPENCODE_API_KEY", "oc_sk_7449eede7974_b7ewKc_a1_U9Upcg16fn0wbLIvp9SPs6")
OPENCODE_BASE_URL = os.getenv("OPENCODE_BASE_URL", "https://opencode.ai/zen/go/v1")
OPENCODE_MODEL = os.getenv("OPENCODE_MODEL", "glm-5.3-flash")

# Security Password for single-professor gate
APP_PASSWORD = os.getenv("APP_PASSWORD", "exam2026")
SESSION_SECRET = os.getenv("SESSION_SECRET", "studio-secret-key-exam-papers-2026")
