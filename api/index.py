import sys
from pathlib import Path

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.append(str(BASE_DIR))

from main import app
