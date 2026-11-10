import sys
from pathlib import Path
import time
sys.path.append(r'c:\Users\anaha\exam-paper-studio\backend')
from ingestion import IngestionEngine
from generator import GenerationEngine
from config import BASE_DIR, OPENCODE_API_KEY, OPENCODE_BASE_URL, OPENCODE_MODEL

ingestion = IngestionEngine()
gen = GenerationEngine(api_key=OPENCODE_API_KEY, base_url=OPENCODE_BASE_URL, model=OPENCODE_MODEL)

notes_dir = Path(r'C:\Users\anaha\mpk\EXAM PAPER MAKING SYSTEM\MA_NOTES')
pdf_path = notes_dir / 'MA 3rd sem_ Modern Sociological Theories.pdf'

print("1. Extracting PDF notes...")
t0 = time.time()
info = ingestion.extract_notes_from_pdf(pdf_path)
print(f"Extracted {info['total_pages']} pages in {time.time()-t0:.2f}s")

print("2. Preparing context chunks...")
ctx = gen._prepare_context_chunks(info['pages'])
print(f"Context length: {len(ctx)} chars")

print("3. Generating Set A questions via OpenCode Go...")
t1 = time.time()
try:
    res = gen.generate_set_questions(
        subject_name="Modern Sociological Theories",
        subject_code="A070901T",
        set_name="A",
        notes_text_context=ctx,
        marks_format=70,
        is_bilingual=True
    )
    print(f"Generated Set A in {time.time()-t1:.2f}s")
    print(f"Total questions: {len(res['all_questions'])}")
    print(f"Sample Q1 EN: {res['all_questions'][0].en}")
    print(f"Sample Q1 HI: {res['all_questions'][0].hi}")
except Exception as e:
    import traceback
    traceback.print_exc()
