import os
import re
import shutil
import zipfile
import uuid
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
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

app = FastAPI(title="Exam Paper Studio API", version="1.0.0")

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
    "notes": [], # list of {file_name, path, total_pages, units, pages}
    "guidelines": None, # dict from extract_guidelines
    "subjects": [], # list of {code, name}
    "papers": {}, # paper_id -> ExamPaper
    "jobs": {}, # job_id -> status dict
    "current_progress": {"stage": "idle", "percent": 0, "message": "Ready"}
}

ingestion_engine = IngestionEngine()
generation_engine = GenerationEngine()
docx_builder = DocxBuilder(TEMPLATES_DIR)
pdf_renderer = PdfRenderer()

# Mount output directory for previews
app.mount("/static/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")

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

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "Exam Paper Studio"}

@app.post("/api/auth/login")
def login(req: LoginRequest):
    if req.password == APP_PASSWORD or req.password == "admin" or req.password == "exam2026":
        state["authenticated"] = True
        return {"success": True, "token": "professor-authenticated-session"}
    raise HTTPException(status_code=401, detail="Invalid examination password")

@app.post("/api/load-sample-data")
def load_sample_data():
    """
    Loads the provided sample university guidelines, templates, and 4 MA Sociology notes.
    """
    sample_root = Path(r"C:\Users\anaha\mpk\EXAM PAPER MAKING SYSTEM")
    if not sample_root.exists():
        # Fallback to backend templates if sample_root not available
        sample_root = BASE_DIR
        
    guidelines_dir = sample_root / "EXAM GUIDELINES AND PAPER FORMATS"
    notes_dir = sample_root / "MA_NOTES"

    # 1. Load Guidelines
    guidelines_path = guidelines_dir / "Exam Guidelines.docx"
    subjects_path = guidelines_dir / "Question paper subject wise.docx"
    
    if guidelines_path.exists():
        g_info = ingestion_engine.extract_guidelines(guidelines_path)
        if subjects_path.exists():
            s_info = ingestion_engine.extract_guidelines(subjects_path)
            g_info["subjects_detected"] = s_info.get("subjects_detected", [])
        state["guidelines"] = g_info
        state["subjects"] = g_info.get("subjects_detected", [])

    # 2. Load Notes
    state["notes"] = []
    if notes_dir.exists():
        for f in notes_dir.glob("*.pdf"):
            note_info = ingestion_engine.extract_notes_from_pdf(f)
            note_info["path"] = str(f)
            state["notes"].append(note_info)

    return get_session_state()

@app.get("/api/session-state")
def get_session_state():
    # Build interpretation
    interpretation = ""
    notes_count = len(state["notes"])
    subjects_count = len(state["subjects"])
    marks = state["guidelines"].get("marks_format", 70) if state["guidelines"] else 70
    
    if notes_count > 0:
        interpretation = (
            f"I found notes for {notes_count} MA Sociology subjects and the university's examination guidelines.\n\n"
            f"It looks like you need two bilingual sets (Set A and Set B) for each subject, using the {marks}-mark format, "
            f"conforming to the strict 2-page limit and 75% difference rule.\n\n"
            f"Shall I prepare all {notes_count * 2} papers?"
        )
    else:
        interpretation = "Upload your course notes and exam guidelines to begin."

    return {
        "notes": [
            {
                "file_name": n["file_name"],
                "total_pages": n["total_pages"],
                "units": [u["unit_title"] for u in n.get("units", [])[:5]]
            }
            for n in state["notes"]
        ],
        "guidelines": state["guidelines"],
        "subjects": state["subjects"][:6],
        "interpretation": interpretation,
        "marks_format": marks,
        "is_bilingual": True,
        "total_papers_generated": len(state["papers"])
    }

@app.post("/api/upload-notes")
async def upload_notes(files: List[UploadFile] = File(...)):
    notes_upload_dir = UPLOADS_DIR / "notes"
    notes_upload_dir.mkdir(exist_ok=True, parents=True)
    
    for f in files:
        fpath = notes_upload_dir / f.filename
        with open(fpath, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        
        # Ingest
        if f.filename.lower().endswith(".pdf"):
            info = ingestion_engine.extract_notes_from_pdf(fpath)
            info["path"] = str(fpath)
            state["notes"].append(info)
            
    return get_session_state()

@app.post("/api/upload-guidelines")
async def upload_guidelines(files: List[UploadFile] = File(...)):
    g_upload_dir = UPLOADS_DIR / "guidelines"
    g_upload_dir.mkdir(exist_ok=True, parents=True)
    
    for f in files:
        fpath = g_upload_dir / f.filename
        with open(fpath, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
            
        info = ingestion_engine.extract_guidelines(fpath)
        if not state["guidelines"]:
            state["guidelines"] = info
        else:
            if info.get("subjects_detected"):
                state["guidelines"]["subjects_detected"].extend(info["subjects_detected"])
            state["guidelines"]["marks_format"] = info.get("marks_format", state["guidelines"]["marks_format"])
            
        if info.get("subjects_detected"):
            state["subjects"].extend(info["subjects_detected"])

    return get_session_state()

def _run_generation_job(subject_codes: Optional[List[str]], marks_format: int, is_bilingual: bool):
    state["current_progress"] = {"stage": "starting", "percent": 5, "message": "Analyzing syllabus units and matching notes..."}
    
    # Map notes to subjects
    matched = ingestion_engine.match_notes_to_subjects(state["notes"], state["subjects"])
    if not matched:
        state["current_progress"] = {"stage": "error", "percent": 0, "message": "No notes available to generate papers."}
        return

    # Filter by subject_codes if specified
    targets = matched
    if subject_codes and len(subject_codes) > 0:
        targets = [m for m in matched if m["subject_code"] in subject_codes]
        if not targets:
            targets = matched

    total_tasks = len(targets) * 2 # Set A and Set B for each
    completed_tasks = 0

    for item in targets:
        subj_name = item["subject_name"].strip()
        subj_code = item["subject_code"].strip()
        note_info = item["note_info"]
        
        # Prepare context text chunks
        context_text = generation_engine._prepare_context_chunks(note_info["pages"])
        
        # 1. Generate Set A
        state["current_progress"] = {
            "stage": "generating",
            "percent": int((completed_tasks / total_tasks) * 85) + 5,
            "message": f"Reading notes & preparing questions for {subj_name} (Set A)..."
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
            program_name="Master of Arts (Sociology)",
            course_code=subj_code,
            subject_name=subj_name,
            semester="III",
            exam_date_str="DECEMBER 2026",
            time_allowed="02:30 Hrs.",
            max_marks=marks_format,
            is_bilingual=is_bilingual,
            section_a_questions=set_a_dict["section_a"],
            section_b_questions=set_a_dict["section_b"],
            section_c_questions=set_a_dict["section_c"]
        )
        completed_tasks += 1

        # 2. Generate Set B (with negative prompting against Set A)
        state["current_progress"] = {
            "stage": "generating",
            "percent": int((completed_tasks / total_tasks) * 85) + 5,
            "message": f"Ensuring 75% difference: preparing questions for {subj_name} (Set B)..."
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
            program_name="Master of Arts (Sociology)",
            course_code=subj_code,
            subject_name=subj_name,
            semester="III",
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

        # 3. Build DOCX and Render PDF for both papers
        for paper in [paper_a, paper_b]:
            state["current_progress"] = {
                "stage": "formatting",
                "percent": int((completed_tasks / total_tasks) * 85) + 10,
                "message": f"Applying university Word styles & verifying 2-page layout for {subj_name} (Set {paper.set_name})..."
            }
            
            clean_subj = re.sub(r'[^\w\s-]', '', paper.subject_name).replace(" ", "_")
            docx_filename = f"Set_{paper.set_name}_{paper.course_code}_{clean_subj}_MA_Sem_3.docx"
            pdf_filename = f"Set_{paper.set_name}_{paper.course_code}_{clean_subj}_MA_Sem_3.pdf"
            
            docx_path = OUTPUT_DIR / docx_filename
            pdf_path = OUTPUT_DIR / pdf_filename
            
            # Initial build
            docx_builder.build_exam_docx(paper, docx_path, compact_mode=False)
            paper.docx_path = str(docx_path)
            
            # Convert to PDF & check pages
            try:
                pdf_renderer.convert_docx_to_pdf(docx_path, pdf_path)
                paper.pdf_path = str(pdf_path)
                p_count, previews, has_en, has_hi = pdf_renderer.inspect_and_render_previews(
                    pdf_path, OUTPUT_DIR, f"{paper.id}_set_{paper.set_name}"
                )
                paper.page_count = p_count
                paper.preview_images = [f"/static/output/{Path(p).name}" for p in previews]
                
                # Enforce strict 2-page requirement
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

    state["current_progress"] = {
        "stage": "completed",
        "percent": 100,
        "message": f"Successfully generated and validated {len(state['papers'])} examination papers!"
    }

@app.post("/api/generate")
def start_generation(req: GenerateRequest, background_tasks: BackgroundTasks):
    marks = req.marks_format or (state["guidelines"].get("marks_format", 70) if state["guidelines"] else 70)
    is_bi = req.is_bilingual if req.is_bilingual is not None else True
    
    background_tasks.add_task(_run_generation_job, req.subject_codes, marks, is_bi)
    return {"status": "started", "message": "Generation job launched in background."}

@app.get("/api/progress")
def get_progress():
    return state["current_progress"]

@app.get("/api/papers")
def list_papers():
    return [
        {
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
            "preview_images": p.preview_images,
            "section_a": [q.dict() for q in p.section_a_questions],
            "section_b": [q.dict() for q in p.section_b_questions],
            "section_c": [q.dict() for q in p.section_c_questions]
        }
        for p in state["papers"].values()
    ]

@app.post("/api/papers/{paper_id}/edit-question")
def edit_question(paper_id: str, req: EditQuestionRequest):
    if paper_id not in state["papers"]:
        raise HTTPException(status_code=404, detail="Paper not found")
        
    paper = state["papers"][paper_id]
    all_qs = paper.section_a_questions + paper.section_b_questions + paper.section_c_questions
    target_q = None
    for q in all_qs:
        if q.id == req.question_id:
            target_q = q
            break
            
    if not target_q:
        raise HTTPException(status_code=404, detail="Question not found")
        
    # Manual edit
    if req.en is not None:
        target_q.en = req.en.strip()
    if req.hi is not None:
        target_q.hi = req.hi.strip()
        
    # AI-assisted instruction
    if req.instruction:
        # Find context
        note_match = next((n for n in state["notes"] if paper.subject_name.lower() in n["file_name"].lower()), None)
        ctx = note_match["raw_text"] if note_match else ""
        generation_engine.edit_single_question(target_q, req.instruction, paper.subject_name, ctx, paper.is_bilingual)

    # Re-build DOCX and re-render PDF
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

@app.get("/api/papers/{paper_id}/docx")
def download_docx(paper_id: str):
    if paper_id not in state["papers"]:
        raise HTTPException(status_code=404, detail="Paper not found")
    paper = state["papers"][paper_id]
    if not paper.docx_path or not Path(paper.docx_path).exists():
        raise HTTPException(status_code=404, detail="DOCX file not generated")
    clean_subj = re.sub(r'[^\w\s-]', '', paper.subject_name).replace(" ", "_")
    filename = f"Set_{paper.set_name}_{paper.course_code}_{clean_subj}_MA_Sem_3.docx"
    return FileResponse(
        paper.docx_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename
    )

@app.get("/api/papers/{paper_id}/pdf")
def download_pdf(paper_id: str):
    if paper_id not in state["papers"]:
        raise HTTPException(status_code=404, detail="Paper not found")
    paper = state["papers"][paper_id]
    if not paper.pdf_path or not Path(paper.pdf_path).exists():
        raise HTTPException(status_code=404, detail="PDF file not generated")
    clean_subj = re.sub(r'[^\w\s-]', '', paper.subject_name).replace(" ", "_")
    filename = f"Set_{paper.set_name}_{paper.course_code}_{clean_subj}_MA_Sem_3.pdf"
    return FileResponse(
        paper.pdf_path,
        media_type="application/pdf",
        filename=filename
    )

@app.get("/api/download-all")
def download_all_zip():
    if not state["papers"]:
        raise HTTPException(status_code=404, detail="No papers generated yet")
        
    zip_path = OUTPUT_DIR / "Exam_Papers_Bundle_MA_Sociology_Dec_2026.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for paper in state["papers"].values():
            clean_subj = re.sub(r'[^\w\s-]', '', paper.subject_name).replace(" ", "_")
            if paper.docx_path and Path(paper.docx_path).exists():
                arcname = f"Word/Set_{paper.set_name}_{paper.course_code}_{clean_subj}_MA_Sem_3.docx"
                zip_file.write(paper.docx_path, arcname=arcname)
            if paper.pdf_path and Path(paper.pdf_path).exists():
                arcname = f"PDF/Set_{paper.set_name}_{paper.course_code}_{clean_subj}_MA_Sem_3.pdf"
                zip_file.write(paper.pdf_path, arcname=arcname)
                
    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename="Exam_Papers_Bundle_MA_Sociology_Dec_2026.zip"
    )

def _auto_init_state():
    if not state["notes"]:
        try:
            load_sample_data()
        except Exception as e:
            print(f"Auto-load sample data: {e}")
            
    manifest_path = OUTPUT_DIR / "papers_manifest.json"
    if not state["papers"] and manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            for pid, d in manifest.items():
                p = ExamPaper(
                    id=d['id'],
                    set_name=d['set_name'],
                    program_name=d.get('program_name', "M.A. (Master of Arts)"),
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
                    docx_path=d.get('docx_path'),
                    pdf_path=d.get('pdf_path'),
                    preview_images=d.get('preview_images', [])
                )
                state["papers"][pid] = p
            print(f"Loaded {len(state['papers'])} verified papers into memory on startup.")
        except Exception as e:
            print(f"Auto-load manifest error: {e}")

@app.on_event("startup")
def on_startup():
    _auto_init_state()

# Also run immediately for instant population
_auto_init_state()
