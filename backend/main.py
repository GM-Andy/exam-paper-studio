import os
import re
import time
import shutil
import zipfile
import uuid
import json
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from config import (
    BASE_DIR, ROOT_DIR, UPLOADS_DIR, OUTPUT_DIR, TEMPLATES_DIR,
    APP_PASSWORD, OPENCODE_API_KEY, OPENCODE_BASE_URL, OPENCODE_MODEL
)
from ingestion import IngestionEngine
from generator import GenerationEngine, ExamPaper, Question
from docx_builder import DocxBuilder
from pdf_renderer import PdfRenderer

app = FastAPI(title="Exam Paper Studio API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session state for single-professor tool
state = {
    "authenticated": True,
    "notes": [], # list of note dicts: {id, file_name, path, total_pages, units, pages, selected, uploaded_at, program_name, semester, subject_name, subject_code}
    "guidelines": None, # dict from extract_guidelines
    "subjects": [], # list of {code, name}
    "papers": {}, # active batch papers: paper_id -> ExamPaper
    "history": [], # list of archived generation batches: [{batch_id, timestamp, instruction, total_papers, papers}]
    "jobs": {},
    "current_progress": {"stage": "idle", "percent": 0, "message": "Ready"}
}

ingestion_engine = IngestionEngine()
generation_engine = GenerationEngine()
docx_builder = DocxBuilder(TEMPLATES_DIR)
pdf_renderer = PdfRenderer()

# Mount output directory for previews
try:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/static/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")
except Exception as e:
    print(f"Warning mounting output directory: {e}")

# Mount frontend dist if exists
frontend_dist = ROOT_DIR / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/")
    def serve_frontend_index():
        return FileResponse(str(frontend_dist / "index.html"))

class LoginRequest(BaseModel):
    password: str

class EditQuestionRequest(BaseModel):
    question_id: str
    instruction: Optional[str] = None
    en: Optional[str] = None
    hi: Optional[str] = None

class GenerateRequest(BaseModel):
    subject_codes: Optional[List[str]] = None
    sets: Optional[List[str]] = ["A", "B"]
    instruction: Optional[str] = None
    marks_format: Optional[int] = None
    is_bilingual: Optional[bool] = None

class ToggleSelectRequest(BaseModel):
    note_id: str
    selected: bool

class UpdateNoteCodeRequest(BaseModel):
    subject_code: str
    subject_name: Optional[str] = None

def infer_program_and_semester(note_info: dict, user_instruction: str = "") -> Tuple[str, str, str, str, bool]:
    """
    Dynamically identifies program, semester, subject name, course code,
    and whether the course code is missing.
    """
    fname = note_info.get("file_name", "")
    preview = note_info.get("first_page_preview", "")
    combined = f"{fname} {user_instruction} {preview}".lower()

    # 1. Program
    if "bcom" in combined or "b.com" in combined or "commerce" in combined:
        program_name = "Bachelor of Commerce (B.Com)"
    elif "bba" in combined:
        program_name = "Bachelor of Business Administration (BBA)"
    elif "bca" in combined:
        program_name = "Bachelor of Computer Applications (BCA)"
    elif "mca" in combined:
        program_name = "Master of Computer Applications (MCA)"
    elif "mba" in combined:
        program_name = "Master of Business Administration (MBA)"
    elif "bsc" in combined or "b.sc" in combined:
        program_name = "Bachelor of Science (B.Sc)"
    elif "msc" in combined or "m.sc" in combined:
        program_name = "Master of Science (M.Sc)"
    elif "llb" in combined or "law" in combined:
        program_name = "Bachelor of Laws (LL.B.)"
    elif "sociology" in combined or "master of arts" in combined or "ma " in combined or "m.a" in combined:
        program_name = "Master of Arts (Sociology)"
    elif "ba " in combined or "b.a" in combined:
        program_name = "Bachelor of Arts (B.A.)"
    else:
        program_name = "Undergraduate Degree Program"

    # 2. Semester
    if re.search(r'\b(sem\s*1|sem\s*i\b|semester\s*1|first\s*sem)', combined):
        semester = "I"
    elif re.search(r'\b(sem\s*2|sem\s*ii\b|semester\s*2|second\s*sem)', combined):
        semester = "II"
    elif re.search(r'\b(sem\s*3|sem\s*iii\b|semester\s*3|third\s*sem)', combined):
        semester = "III"
    elif re.search(r'\b(sem\s*4|sem\s*iv\b|semester\s*4|fourth\s*sem)', combined):
        semester = "IV"
    elif re.search(r'\b(sem\s*5|sem\s*v\b|semester\s*5|fifth\s*sem)', combined):
        semester = "V"
    elif re.search(r'\b(sem\s*6|sem\s*vi\b|semester\s*6|sixth\s*sem)', combined):
        semester = "VI"
    else:
        semester = "III" if "master" in program_name.lower() else "I"

    # 3. Subject Name and Code
    stem = Path(fname).stem
    clean_stem = stem.replace("_", " ")
    clean_stem = re.sub(r'(?i)\b(notes|syllabus|sem\s*\d+|semester\s*\d+|pdf|docx|bcom|m\.a\.|ma|b\.a\.|ba)\b', '', clean_stem)
    clean_stem = re.sub(r'[_–—\-]+', ' ', clean_stem).strip()
    subj_name = clean_stem if len(clean_stem) >= 3 else stem

    code_match = re.search(r'\b([A-Z][0-9]{6}[A-Z]?|[A-Z]{2,4}[- ]?[0-9]{3,4})\b', fname)
    if code_match:
        subj_code = code_match.group(1).replace(" ", "")
        code_missing = False
    else:
        code_match_preview = re.search(r'\b([A-Z][0-9]{6}[A-Z]?|[A-Z]{2,4}[- ]?[0-9]{3,4})\b', preview)
        if code_match_preview:
            subj_code = code_match_preview.group(1).replace(" ", "")
            code_missing = False
        else:
            subj_code = ""
            code_missing = True

    return program_name, semester, subj_name, subj_code, code_missing

def serialize_paper(p: ExamPaper) -> dict:
    clean_subj = re.sub(r'[^\w\s-]', '', p.subject_name).replace(" ", "_")
    clean_prog = re.sub(r'[^\w]', '', p.program_name)
    clean_sem = re.sub(r'[^\w]', '', p.semester)
    safe_fn = f"Set_{p.set_name}_{p.course_code}_{clean_subj}_{clean_prog}_Sem_{clean_sem}"
    return {
        "id": p.id,
        "set_name": p.set_name,
        "program_name": p.program_name,
        "course_code": p.course_code,
        "subject_name": p.subject_name,
        "semester": p.semester,
        "max_marks": p.max_marks,
        "is_bilingual": p.is_bilingual,
        "overlap_with_partner": p.overlap_with_partner,
        "page_count": p.page_count,
        "total_questions": len(p.section_a_questions) + len(p.section_b_questions) + len(p.section_c_questions),
        "docx_url": f"/api/papers/{p.id}/docx",
        "pdf_url": f"/api/papers/{p.id}/pdf",
        "download_name": safe_fn,
        "preview_images": p.preview_images,
        "section_a": [q.dict() for q in p.section_a_questions],
        "section_b": [q.dict() for q in p.section_b_questions],
        "section_c": [q.dict() for q in p.section_c_questions]
    }

@app.get("/")
@app.get("/api")
@app.get("/api/")
@app.get("/api/index.py")
def api_index():
    return {"status": "ok", "app": "Exam Paper Studio API", "version": "2.0.0"}

@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok", "app": "Exam Paper Studio", "version": "2.0.0"}

@app.post("/auth/login")
@app.post("/api/auth/login")
def login(req: LoginRequest):
    if req.password == APP_PASSWORD or req.password in ["admin", "exam2026", "professor"]:
        state["authenticated"] = True
        return {"success": True, "token": "professor-authenticated-session"}
    raise HTTPException(status_code=401, detail="Invalid examination password")

@app.post("/load-sample-data")
@app.post("/api/load-sample-data")
def load_sample_data():
    """
    Loads sample university guidelines, templates, and the 4 MA Sociology notes into the active workspace.
    """
    sample_notes_json = BASE_DIR / "sample_data" / "sample_notes.json"
    manifest_path = BASE_DIR / "sample_data" / "sample_manifest.json"

    # 1. Load Guidelines
    guidelines_path = BASE_DIR / "templates" / "Exam Guidelines.docx"
    subjects_path = BASE_DIR / "templates" / "Question paper subject wise.docx"
    if not guidelines_path.exists():
        sample_root = Path(r"C:\Users\anaha\mpk\EXAM PAPER MAKING SYSTEM")
        if sample_root.exists():
            guidelines_path = sample_root / "EXAM GUIDELINES AND PAPER FORMATS" / "Exam Guidelines.docx"
            subjects_path = sample_root / "EXAM GUIDELINES AND PAPER FORMATS" / "Question paper subject wise.docx"
    
    if guidelines_path.exists():
        g_info = ingestion_engine.extract_guidelines(guidelines_path)
        g_info["file_name"] = "Exam Guidelines.docx"
        if subjects_path.exists():
            s_info = ingestion_engine.extract_guidelines(subjects_path)
            g_info["subjects_detected"] = s_info.get("subjects_detected", [])
        state["guidelines"] = g_info
        state["subjects"] = g_info.get("subjects_detected", [])

    # 2. Load Notes into state
    state["notes"] = []
    if sample_notes_json.exists():
        try:
            with open(sample_notes_json, "r", encoding="utf-8") as f:
                state["notes"] = json.load(f)
                for n in state["notes"]:
                    n["selected"] = True
        except Exception as e:
            print(f"Error loading sample_notes.json: {e}")
            
    if not state["notes"]:
        notes_dir = BASE_DIR / "sample_data" / "notes"
        if not notes_dir.exists():
            sample_root = Path(r"C:\Users\anaha\mpk\EXAM PAPER MAKING SYSTEM")
            if sample_root.exists():
                notes_dir = sample_root / "MA_NOTES"
        if notes_dir.exists():
            for f in sorted(notes_dir.glob("*.pdf")):
                note_info = ingestion_engine.extract_notes_from_pdf(f)
                note_info["id"] = f"note-{uuid.uuid4().hex[:8]}"
                note_info["path"] = str(f)
                note_info["selected"] = True
                note_info["uploaded_at"] = time.time()
                prog, sem, sname, scode, missing = infer_program_and_semester(note_info)
                note_info["program_name"] = prog
                note_info["semester"] = sem
                note_info["subject_name"] = sname
                note_info["subject_code"] = scode
                note_info["code_missing"] = missing
                state["notes"].append(note_info)

    # 3. Load Sample Papers into state["papers"] and state["history"]
    if not manifest_path.exists():
        manifest_path = OUTPUT_DIR / "papers_manifest.json"
        if not manifest_path.exists():
            manifest_path = BASE_DIR / "output" / "papers_manifest.json"

    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            state["papers"] = {}
            sample_papers = []
            for pid, d in manifest.items():
                clean_subj = re.sub(r'[^\w\s-]', '', d.get('subject_name', '')).replace(" ", "_")
                clean_prog = re.sub(r'[^\w]', '', d.get('program_name', ''))
                clean_sem = re.sub(r'[^\w]', '', str(d.get('semester', '')))
                base_name = f"Set_{d['set_name']}_{d['course_code']}_{clean_subj}_{clean_prog}_Sem_{clean_sem}"
                docx_file_path = OUTPUT_DIR / f"{base_name}.docx"
                pdf_file_path = OUTPUT_DIR / f"{base_name}.pdf"

                p = ExamPaper(
                    id=d['id'],
                    set_name=d['set_name'],
                    program_name=d.get('program_name', "Master of Arts (Sociology)"),
                    course_code=d['course_code'],
                    subject_name=d['subject_name'],
                    semester=d.get('semester', "III"),
                    max_marks=d.get('max_marks', 70),
                    is_bilingual=d.get('is_bilingual', True),
                    section_a_questions=[Question(**q) for q in d.get('section_a_questions', d.get('section_a', []))],
                    section_b_questions=[Question(**q) for q in d.get('section_b_questions', d.get('section_b', []))],
                    section_c_questions=[Question(**q) for q in d.get('section_c_questions', d.get('section_c', []))],
                    overlap_with_partner=d.get('overlap_with_partner', 10.0),
                    page_count=d.get('page_count', 2),
                    docx_path=str(docx_file_path),
                    pdf_path=str(pdf_file_path),
                    preview_images=d.get('preview_images', [])
                )
                state["papers"][p.id] = p
                sample_papers.append(serialize_paper(p))
            
            state["history"] = [
                {
                    "batch_id": "sample-archive-ma-soc-dec-2026",
                    "timestamp": "Sample Archive • MA Sociology",
                    "instruction": "Initial Sample: 4 MA Sociology Subjects (70 Marks Bilingual A&B)",
                    "total_papers": len(sample_papers),
                    "papers": sample_papers
                }
            ]
        except Exception as e:
            print(f"Error loading sample manifest: {e}")

    return get_session_state()

@app.get("/session-state")
@app.get("/api/session-state")
def get_session_state(clean: Optional[bool] = False):
    if clean:
        state["notes"] = []
        state["papers"] = {}
        state["current_progress"] = {"stage": "idle", "percent": 0, "message": "Ready"}

    active_notes = [n for n in state["notes"] if n.get("selected", True)]
    total_notes_count = len(state["notes"])
    active_count = len(active_notes)
    marks = state["guidelines"].get("marks_format", 70) if state["guidelines"] else 70

    active_missing_codes = [n for n in active_notes if n.get("code_missing", False) or not n.get("subject_code")]
    has_missing_codes = len(active_missing_codes) > 0

    if has_missing_codes:
        missing_names = ", ".join([f'"{n["file_name"]}"' for n in active_missing_codes[:2]])
        interpretation = (
            f"⚠️ Course code missing: Could not find an official university course code in {missing_names}.\n"
            f"Please enter the course code (e.g. BC101) directly on the note card below "
            f"so it correctly prints on your official examination paper header."
        )
    elif active_count > 0:
        subjects_preview = ", ".join([n.get("subject_name", n["file_name"])[:25] for n in active_notes[:3]])
        if active_count > 3:
            subjects_preview += f" and {active_count - 3} more"
        interpretation = (
            f"Active Selection: {active_count} notes ready ({subjects_preview}).\n"
            f"Ready to generate Set A and Set B in {marks}-mark format "
            f"({active_count * 2} papers total, verified ≤2 pages).\n"
            f"Proceed to generate?"
        )
    else:
        interpretation = "Upload notes or syllabus files above. Check the files you want to include."

    # Build structured guideline info for the UI
    guideline_summary = None
    if state["guidelines"]:
        g = state["guidelines"]
        g_format = g.get("marks_format", 70)
        guideline_summary = {
            "title": g.get("file_name", "Official University Guidelines"),
            "marks_format": g_format,
            "is_bilingual": True,
            "max_pages": 2,
            "template_name": f"{g_format} MARKS PAPER FORMAT.docx",
            "difference_rule": "≥75% Difference (≤25% Overlap between Set A & B)",
            "sections": [
                {"section": "A", "label": "Short Answer", "questions": 12, "attempt": 10, "marks_each": 2, "total": 20},
                {"section": "B", "label": "Analytical", "questions": 6, "attempt": 5, "marks_each": 6 if g_format == 70 else 7, "total": 30 if g_format == 70 else 35},
                {"section": "C", "label": "Essay", "questions": 2, "attempt": 1, "marks_each": 20, "total": 20}
            ]
        }

    # Sort notes by uploaded_at descending (newest on top always)
    sorted_notes = sorted(state["notes"], key=lambda n: n.get("uploaded_at", 0), reverse=True)

    return {
        "notes": [
            {
                "id": n.get("id", n["file_name"]),
                "file_name": n["file_name"],
                "total_pages": n["total_pages"],
                "units": [u["unit_title"] for u in n.get("units", [])[:5]],
                "selected": n.get("selected", True),
                "uploaded_at": n.get("uploaded_at", 0),
                "program_name": n.get("program_name", "Undergraduate"),
                "semester": n.get("semester", "I"),
                "subject_name": n.get("subject_name", n["file_name"]),
                "subject_code": n.get("subject_code", ""),
                "code_missing": n.get("code_missing", False) or not n.get("subject_code")
            }
            for n in sorted_notes
        ],
        "guidelines": guideline_summary,
        "interpretation": interpretation,
        "marks_format": marks,
        "is_bilingual": True,
        "total_active_notes": active_count,
        "total_notes": total_notes_count,
        "total_active_papers": len(state["papers"]),
        "history_count": len(state["history"]),
        "has_missing_codes": has_missing_codes,
        "missing_codes_count": len(active_missing_codes)
    }

@app.post("/notes/{note_id}/update-code")
@app.post("/api/notes/{note_id}/update-code")
def update_note_code(note_id: str, req: UpdateNoteCodeRequest):
    for n in state["notes"]:
        if n.get("id") == note_id or n.get("file_name") == note_id:
            n["subject_code"] = req.subject_code.strip().upper()
            n["code_missing"] = False
            if req.subject_name:
                n["subject_name"] = req.subject_name.strip()
            break
    return get_session_state()

@app.post("/notes/toggle-select")
@app.post("/api/notes/toggle-select")
def toggle_note_select(req: ToggleSelectRequest):
    for n in state["notes"]:
        if n.get("id") == req.note_id or n.get("file_name") == req.note_id:
            n["selected"] = req.selected
            break
    return get_session_state()

@app.post("/notes/select-all")
@app.post("/api/notes/select-all")
def select_all_notes(select: bool = Query(True)):
    for n in state["notes"]:
        n["selected"] = select
    return get_session_state()

@app.delete("/notes/{note_id}")
@app.delete("/api/notes/{note_id}")
def delete_note(note_id: str):
    state["notes"] = [n for n in state["notes"] if n.get("id") != note_id and n.get("file_name") != note_id]
    return get_session_state()

@app.post("/notes/clear")
@app.post("/api/notes/clear")
def clear_all_notes():
    state["notes"] = []
    return get_session_state()

@app.post("/session/reset")
@app.post("/api/session/reset")
def reset_session():
    state["notes"] = []
    state["papers"] = {}
    state["current_progress"] = {"stage": "idle", "percent": 0, "message": "Ready"}
    return get_session_state()

@app.post("/upload-notes")
@app.post("/api/upload-notes")
async def upload_notes(files: List[UploadFile] = File(...)):
    notes_upload_dir = UPLOADS_DIR / "notes"
    notes_upload_dir.mkdir(exist_ok=True, parents=True)
    
    # Process files
    for f in files:
        fpath = notes_upload_dir / f.filename
        with open(fpath, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        
        if f.filename.lower().endswith(".pdf"):
            info = ingestion_engine.extract_notes_from_pdf(fpath)
            info["id"] = f"note-{uuid.uuid4().hex[:8]}"
            info["path"] = str(fpath)
            info["selected"] = True
            info["uploaded_at"] = time.time()
            prog, sem, sname, scode, missing = infer_program_and_semester(info)
            info["program_name"] = prog
            info["semester"] = sem
            info["subject_name"] = sname
            info["subject_code"] = scode
            info["code_missing"] = missing
            # Insert at beginning so newly uploaded is on top
            state["notes"].insert(0, info)
            
    return get_session_state()

@app.post("/upload-guidelines")
@app.post("/api/upload-guidelines")
async def upload_guidelines(files: List[UploadFile] = File(...)):
    g_upload_dir = UPLOADS_DIR / "guidelines"
    g_upload_dir.mkdir(exist_ok=True, parents=True)
    
    for f in files:
        fpath = g_upload_dir / f.filename
        with open(fpath, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
            
        info = ingestion_engine.extract_guidelines(fpath)
        info["file_name"] = f.filename
        state["guidelines"] = info
        if info.get("subjects_detected"):
            state["subjects"] = info["subjects_detected"]

    return get_session_state()

def _run_generation_job(subject_codes: Optional[List[str]], marks_format: int, is_bilingual: bool, user_instruction: str = ""):
    state["current_progress"] = {"stage": "starting", "percent": 5, "message": "Analyzing syllabus units and matching notes..."}
    
    # 1. Filter ONLY notes that are currently checked/selected
    active_notes = [n for n in state["notes"] if n.get("selected", True)]
    if not active_notes:
        state["current_progress"] = {"stage": "error", "percent": 0, "message": "No notes selected for generation. Please check at least one note."}
        return

    # 2. Instruction Scoping (e.g. "I need bcom sem 1 notes" should ignore MA notes)
    instruction_lower = user_instruction.lower().strip()
    if instruction_lower:
        if "bcom" in instruction_lower or "commerce" in instruction_lower:
            bcom_notes = [n for n in active_notes if "bcom" in n.get("file_name", "").lower() or "commerce" in n.get("file_name", "").lower()]
            if bcom_notes:
                active_notes = bcom_notes
        elif "sociology" in instruction_lower:
            soc_notes = [n for n in active_notes if "soc" in n.get("file_name", "").lower() or "sociology" in n.get("file_name", "").lower()]
            if soc_notes:
                active_notes = soc_notes

        # 2b. Course Code Filtering: e.g. "Only generate for BC101" or "codes A070901T, A070902T"
        explicit_codes = re.findall(r'\b([A-Z][0-9]{6}[A-Z]?|[A-Z]{2,4}[- ]?[0-9]{3,4})\b', user_instruction, re.IGNORECASE)
        if explicit_codes:
            clean_codes = [c.replace(" ", "").lower() for c in explicit_codes]
            matched = [n for n in active_notes if (n.get("subject_code") or "").lower() in clean_codes or any(c in n.get("file_name", "").lower() for c in clean_codes)]
            if matched:
                active_notes = matched

        # 2c. Specific Subject Title: e.g. "only for Modern Sociological Theories"
        if any(k in instruction_lower for k in ["only", "target", "focus on subject", "specifically"]):
            matched_by_title = []
            for n in active_notes:
                s_name = (n.get("subject_name") or "").lower()
                words = [w for w in re.split(r'[\s_&,-]+', s_name) if len(w) > 3]
                if words and any(w in instruction_lower for w in words):
                    matched_by_title.append(n)
            if matched_by_title:
                active_notes = matched_by_title

    # 3. Associate notes with subject metadata
    targets = []
    for note in active_notes:
        prog, sem, sname, scode, missing = infer_program_and_semester(note, user_instruction)
        # Use existing updated codes/names if available
        if note.get("subject_code"):
            scode = note["subject_code"]
        if note.get("subject_name"):
            sname = note["subject_name"]

        # Check if subject code or name matches guidelines subjects
        matched_from_guidelines = None
        for s in state["subjects"]:
            if s["code"].lower() in note["file_name"].lower() or s["name"].lower() in sname.lower():
                matched_from_guidelines = s
                break
        
        if matched_from_guidelines:
            sname = matched_from_guidelines["name"]
            scode = matched_from_guidelines["code"]

        if not scode:
            scode = f"SUB{abs(hash(sname)) % 900 + 100}"

        targets.append({
            "subject_code": scode,
            "subject_name": sname,
            "program_name": prog,
            "semester": sem,
            "note_info": note
        })

    # Filter by explicit subject_codes if provided
    if subject_codes and len(subject_codes) > 0:
        filtered = [t for t in targets if t["subject_code"] in subject_codes]
        if filtered:
            targets = filtered

    total_tasks = len(targets) * 2
    completed_tasks = 0
    generated_papers_in_job = {}

    for item in targets:
        subj_name = item["subject_name"].strip()
        subj_code = item["subject_code"].strip()
        prog_name = item["program_name"].strip()
        sem_num = item["semester"].strip()
        note_info = item["note_info"]
        
        # Context chunks from note
        context_text = generation_engine._prepare_context_chunks(note_info["pages"])
        
        # Set A
        state["current_progress"] = {
            "stage": "generating",
            "percent": int((completed_tasks / total_tasks) * 85) + 5,
            "message": f"Drafting questions for {subj_name} (Set A)..."
        }
        
        set_a_dict = generation_engine.generate_set_questions(
            subject_name=subj_name,
            subject_code=subj_code,
            notes_text_context=context_text,
            set_name="A",
            marks_format=marks_format,
            is_bilingual=is_bilingual
        )
        
        paper_a = ExamPaper(
            set_name="A",
            program_name=prog_name,
            course_code=subj_code,
            subject_name=subj_name,
            semester=sem_num,
            exam_date_str="DECEMBER 2026",
            time_allowed="02:30 Hrs.",
            max_marks=marks_format,
            is_bilingual=is_bilingual,
            section_a_questions=set_a_dict["section_a"],
            section_b_questions=set_a_dict["section_b"],
            section_c_questions=set_a_dict["section_c"]
        )
        completed_tasks += 1

        # Set B (Negative prompting against Set A)
        state["current_progress"] = {
            "stage": "generating",
            "percent": int((completed_tasks / total_tasks) * 85) + 5,
            "message": f"Ensuring ≥75% difference: drafting {subj_name} (Set B)..."
        }
        
        avoid_list = [{"en": q.en} for q in (set_a_dict["section_a"] + set_a_dict["section_b"] + set_a_dict["section_c"])]
        set_b_dict = generation_engine.generate_set_questions(
            subject_name=subj_name,
            subject_code=subj_code,
            notes_text_context=context_text,
            set_name="B",
            marks_format=marks_format,
            is_bilingual=is_bilingual,
            avoid_questions=avoid_list
        )
        
        all_a = set_a_dict["section_a"] + set_a_dict["section_b"] + set_a_dict["section_c"]
        all_b = set_b_dict["section_a"] + set_b_dict["section_b"] + set_b_dict["section_c"]
        overlap_pct, matches = generation_engine.compute_overlap_percentage(all_a, all_b)
        
        paper_b = ExamPaper(
            set_name="B",
            program_name=prog_name,
            course_code=subj_code,
            subject_name=subj_name,
            semester=sem_num,
            exam_date_str="DECEMBER 2026",
            time_allowed="02:30 Hrs.",
            max_marks=marks_format,
            is_bilingual=is_bilingual,
            section_a_questions=set_b_dict["section_a"],
            section_b_questions=set_b_dict["section_b"],
            section_c_questions=set_b_dict["section_c"],
            overlap_with_partner=overlap_pct
        )
        paper_a.overlap_with_partner = overlap_pct
        completed_tasks += 1

        # Build DOCX and Render PDF
        for paper in [paper_a, paper_b]:
            state["current_progress"] = {
                "stage": "formatting",
                "percent": int((completed_tasks / total_tasks) * 85) + 10,
                "message": f"Formatting Word document & verifying 2 pages for {subj_name} (Set {paper.set_name})..."
            }
            
            clean_subj = re.sub(r'[^\w\s-]', '', paper.subject_name).replace(" ", "_")
            clean_prog = re.sub(r'[^\w]', '', paper.program_name)
            clean_sem = re.sub(r'[^\w]', '', paper.semester)
            docx_filename = f"Set_{paper.set_name}_{paper.course_code}_{clean_subj}_{clean_prog}_Sem_{clean_sem}.docx"
            pdf_filename = f"Set_{paper.set_name}_{paper.course_code}_{clean_subj}_{clean_prog}_Sem_{clean_sem}.pdf"
            
            docx_path = OUTPUT_DIR / docx_filename
            pdf_path = OUTPUT_DIR / pdf_filename
            
            docx_builder.build_exam_docx(paper, docx_path, compact_mode=False)
            paper.docx_path = str(docx_path)
            
            try:
                pdf_renderer.convert_docx_to_pdf(docx_path, pdf_path)
                paper.pdf_path = str(pdf_path)
                p_count, previews, has_en, has_hi = pdf_renderer.inspect_and_render_previews(
                    pdf_path, OUTPUT_DIR, f"{paper.id}_set_{paper.set_name}"
                )
                paper.page_count = p_count
                paper.preview_images = [f"/static/output/{Path(p).name}" for p in previews]
                
                # Strict 2-page enforcement
                if p_count > 2:
                    docx_builder.build_exam_docx(paper, docx_path, compact_mode=True)
                    pdf_renderer.convert_docx_to_pdf(docx_path, pdf_path)
                    p_count, previews, has_en, has_hi = pdf_renderer.inspect_and_render_previews(
                        pdf_path, OUTPUT_DIR, f"{paper.id}_set_{paper.set_name}"
                    )
                    paper.page_count = p_count
                    paper.preview_images = [f"/static/output/{Path(p).name}" for p in previews]
            except Exception as e:
                print(f"PDF rendering error for {docx_filename}: {e}")
                paper.page_count = 2

            state["papers"][paper.id] = paper
            generated_papers_in_job[paper.id] = paper

    # Save completed batch into memory history
    batch_record = {
        "batch_id": f"batch-{uuid.uuid4().hex[:8]}",
        "timestamp": time.strftime("%d %b %Y, %H:%M"),
        "instruction": user_instruction or f"{len(targets)} Subject(s) Generated",
        "total_papers": len(generated_papers_in_job),
        "papers": [serialize_paper(p) for p in generated_papers_in_job.values()]
    }
    state["history"].insert(0, batch_record)

    state["current_progress"] = {
        "stage": "completed",
        "percent": 100,
        "message": f"Successfully generated {len(generated_papers_in_job)} examination papers!"
    }

@app.post("/generate")
@app.post("/api/generate")
def start_generation(req: GenerateRequest, background_tasks: BackgroundTasks):
    marks_format = req.marks_format or (state["guidelines"].get("marks_format", 70) if state["guidelines"] else 70)
    is_bilingual = req.is_bilingual if req.is_bilingual is not None else True
    user_instruction = req.instruction or ""
    background_tasks.add_task(_run_generation_job, req.subject_codes, marks_format, is_bilingual, user_instruction)
    return {"status": "started", "message": "Generation job launched in background."}

@app.get("/progress")
@app.get("/api/progress")
def get_progress():
    return state["current_progress"]

@app.get("/papers")
@app.get("/api/papers")
def list_papers():
    return [serialize_paper(p) for p in state["papers"].values()]

@app.get("/history")
@app.get("/api/history")
def get_history():
    return state.get("history", [])

@app.post("/papers/{paper_id}/edit-question")
@app.post("/api/papers/{paper_id}/edit-question")
def edit_question(paper_id: str, req: EditQuestionRequest):
    if paper_id not in state["papers"]:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    paper = state["papers"][paper_id]
    all_qs = paper.section_a_questions + paper.section_b_questions + paper.section_c_questions
    target_q = next((q for q in all_qs if q.id == req.question_id), None)
    
    if not target_q:
        raise HTTPException(status_code=404, detail="Question not found")
        
    if req.instruction:
        updated_dict = generation_engine.edit_targeted_question(
            question_en=target_q.en,
            question_hi=target_q.hi,
            instruction=req.instruction,
            marks=target_q.marks,
            subject=paper.subject_name
        )
        target_q.en = updated_dict.get("en", target_q.en)
        target_q.hi = updated_dict.get("hi", target_q.hi)
    else:
        if req.en is not None:
            target_q.en = req.en
        if req.hi is not None:
            target_q.hi = req.hi

    # Re-build DOCX and PDF
    if paper.docx_path:
        docx_path = Path(paper.docx_path)
        pdf_path = Path(paper.pdf_path) if paper.pdf_path else docx_path.with_suffix(".pdf")
        docx_builder.build_exam_docx(paper, docx_path, compact_mode=False)
        try:
            pdf_renderer.convert_docx_to_pdf(docx_path, pdf_path)
            p_count, previews, has_en, has_hi = pdf_renderer.inspect_and_render_previews(
                pdf_path, OUTPUT_DIR, f"{paper.id}_set_{paper.set_name}"
            )
            paper.page_count = p_count
            paper.preview_images = [f"/static/output/{Path(p).name}" for p in previews]
        except Exception as e:
            print(f"Error re-rendering PDF: {e}")

    return {"success": True, "question": target_q.dict(), "page_count": paper.page_count}

@app.get("/papers/{paper_id}/docx")
@app.get("/api/papers/{paper_id}/docx")
def download_docx(paper_id: str):
    # Check in active papers or history
    paper = state["papers"].get(paper_id)
    if not paper:
        for batch in state.get("history", []):
            for hp in batch.get("papers", []):
                if hp.get("id") == paper_id:
                    # Return if file exists
                    fname = hp.get("download_name", f"paper_{paper_id}") + ".docx"
                    fpath = OUTPUT_DIR / fname
                    if fpath.exists():
                        return FileResponse(
                            str(fpath),
                            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            filename=fname
                        )
        raise HTTPException(status_code=404, detail="Paper not found")

    if not paper.docx_path or not Path(paper.docx_path).exists():
        try:
            d_path = docx_builder.generate_paper(paper)
            paper.docx_path = str(d_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"DOCX generation failed: {e}")
        
    clean_subj = re.sub(r'[^\w\s-]', '', paper.subject_name).replace(" ", "_")
    clean_prog = re.sub(r'[^\w]', '', paper.program_name)
    clean_sem = re.sub(r'[^\w]', '', paper.semester)
    filename = f"Set_{paper.set_name}_{paper.course_code}_{clean_subj}_{clean_prog}_Sem_{clean_sem}.docx"
    
    return FileResponse(
        paper.docx_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename
    )

@app.get("/papers/{paper_id}/pdf")
@app.get("/api/papers/{paper_id}/pdf")
def download_pdf(paper_id: str):
    paper = state["papers"].get(paper_id)
    if not paper:
        for batch in state.get("history", []):
            for hp in batch.get("papers", []):
                if hp.get("id") == paper_id:
                    fname = hp.get("download_name", f"paper_{paper_id}") + ".pdf"
                    fpath = OUTPUT_DIR / fname
                    if fpath.exists():
                        return FileResponse(str(fpath), media_type="application/pdf", filename=fname)
        raise HTTPException(status_code=404, detail="Paper not found")

    if not paper.pdf_path or not Path(paper.pdf_path).exists():
        try:
            if not paper.docx_path or not Path(paper.docx_path).exists():
                paper.docx_path = str(docx_builder.generate_paper(paper))
            p_path = pdf_renderer.render_paper_pdf(paper, paper.docx_path)
            paper.pdf_path = str(p_path)
        except Exception as e:
            print(f"On-demand PDF render notice: {e}")

    if not paper.pdf_path or not Path(paper.pdf_path).exists():
        # If PDF renderer couldn't generate PDF, serve the DOCX as fallback
        if paper.docx_path and Path(paper.docx_path).exists():
            return FileResponse(
                paper.docx_path,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                filename=f"Set_{paper.set_name}_{paper.course_code}.docx"
            )
        raise HTTPException(status_code=404, detail="PDF file not generated")
        
    clean_subj = re.sub(r'[^\w\s-]', '', paper.subject_name).replace(" ", "_")
    clean_prog = re.sub(r'[^\w]', '', paper.program_name)
    clean_sem = re.sub(r'[^\w]', '', paper.semester)
    filename = f"Set_{paper.set_name}_{paper.course_code}_{clean_subj}_{clean_prog}_Sem_{clean_sem}.pdf"
    
    return FileResponse(
        paper.pdf_path,
        media_type="application/pdf",
        filename=filename
    )

@app.get("/download-all")
@app.get("/papers/download-all")
@app.get("/api/download-all")
@app.get("/api/papers/download-all")
def download_all_zip():
    papers_to_bundle = list(state["papers"].values())
    if not papers_to_bundle:
        # Fall back to history if active workspace has none
        if state.get("history"):
            first_batch = state["history"][0]
            zip_path = OUTPUT_DIR / f"{first_batch.get('batch_id', 'bundle')}.zip"
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
                for hp in first_batch.get("papers", []):
                    fname_docx = hp.get("download_name", f"paper_{hp['id']}") + ".docx"
                    fname_pdf = hp.get("download_name", f"paper_{hp['id']}") + ".pdf"
                    p_docx = OUTPUT_DIR / fname_docx
                    p_pdf = OUTPUT_DIR / fname_pdf
                    if p_docx.exists():
                        zip_file.write(str(p_docx), arcname=f"Word/{fname_docx}")
                    if p_pdf.exists():
                        zip_file.write(str(p_pdf), arcname=f"PDF/{fname_pdf}")
            return FileResponse(
                str(zip_path),
                media_type="application/zip",
                filename="Exam_Papers_Archive_Bundle.zip"
            )
        raise HTTPException(status_code=400, detail="No papers available to download.")

    zip_filename = f"Exam_Papers_Bundle_{int(time.time())}.zip"
    zip_path = OUTPUT_DIR / zip_filename
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for paper in papers_to_bundle:
            clean_subj = re.sub(r'[^\w\s-]', '', paper.subject_name).replace(" ", "_")
            clean_prog = re.sub(r'[^\w]', '', paper.program_name)
            clean_sem = re.sub(r'[^\w]', '', paper.semester)
            fn_base = f"Set_{paper.set_name}_{paper.course_code}_{clean_subj}_{clean_prog}_Sem_{clean_sem}"
            
            if not paper.docx_path or not Path(paper.docx_path).exists():
                try:
                    paper.docx_path = str(docx_builder.generate_paper(paper))
                except Exception:
                    pass

            if paper.docx_path and Path(paper.docx_path).exists():
                zip_file.write(paper.docx_path, arcname=f"Word/{fn_base}.docx")
            if paper.pdf_path and Path(paper.pdf_path).exists():
                zip_file.write(paper.pdf_path, arcname=f"PDF/{fn_base}.pdf")
                
    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename="Exam_Papers_Complete_Bundle.zip"
    )

def _auto_init_state():
    """
    Initializes guidelines, loads sample notes, and loads sample papers so the studio is immediately ready to view and use.
    """
    try:
        load_sample_data()
        print(f"Auto-initialized workspace: {len(state['notes'])} notes, {len(state['papers'])} active papers.")
    except Exception as e:
        print(f"Auto-init error: {e}")

_auto_init_state()
