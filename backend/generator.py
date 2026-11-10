import os
import json
import uuid
import re
import requests
from typing import List, Dict, Any, Optional, Tuple, Callable
from pydantic import BaseModel, Field
import json_repair

from config import OPENCODE_API_KEY, OPENCODE_BASE_URL, OPENCODE_MODEL

class Question(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    section: str # "A", "B", "C"
    number: int # 1..12 in A, 1..6 in B, 1..2 in C
    marks: int # 2, 6 (or 7), 20
    en: str
    hi: Optional[str] = ""
    unit: Optional[str] = "Unit I"
    topic: Optional[str] = ""
    difficulty: Optional[str] = "medium"
    set_name: str = "A"

class ExamPaper(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:10])
    set_name: str # "A" or "B"
    program_name: str = "Master of Arts (Sociology)"
    course_code: str # "A070901T"
    subject_name: str # "Modern Sociological Theories"
    semester: str = "III"
    exam_date_str: str = "DECEMBER 2026"
    time_allowed: str = "02:30 Hrs."
    max_marks: int = 70
    is_bilingual: bool = True
    section_a_questions: List[Question] = []
    section_b_questions: List[Question] = []
    section_c_questions: List[Question] = []
    overlap_with_partner: Optional[float] = 0.0
    page_count: Optional[int] = 2
    docx_path: Optional[str] = None
    pdf_path: Optional[str] = None
    preview_images: List[str] = []

def parse_model_json(text: str) -> dict:
    if not text:
        raise ValueError("Model returned empty text.")
    clean = text.strip()
    clean = re.sub(r'^```(?:json)?\s*', '', clean, flags=re.MULTILINE)
    clean = re.sub(r'```\s*$', '', clean, flags=re.MULTILINE)
    
    # 1. Try direct json.loads
    try:
        return json.loads(clean.strip())
    except Exception:
        pass
        
    # 2. Try json_repair
    try:
        repaired = json_repair.repair_json(clean, return_objects=True)
        if isinstance(repaired, dict):
            return repaired
    except Exception:
        pass

    # 3. Regex match { ... }
    m = re.search(r'(\{[\s\S]*\})', clean)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            repaired = json_repair.repair_json(m.group(1), return_objects=True)
            if isinstance(repaired, dict):
                return repaired
                
    raise ValueError(f"Could not parse valid JSON from text: {clean[:200]}")

class GenerationEngine:
    def __init__(self, api_key: str = OPENCODE_API_KEY, base_url: str = OPENCODE_BASE_URL, model: str = OPENCODE_MODEL):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model

    def _call_llm(self, prompt: str, system_prompt: str = "You are a JSON generator. Do not provide preamble or reasoning. Output only the JSON object starting with { and ending with }.") -> str:
        session_id = f"session-{uuid.uuid4().hex[:12]}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "x-opencode-session": session_id
        }
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
            "max_tokens": 3500
        }
        
        resp = requests.post(url, headers=headers, json=payload, timeout=80)
        if resp.status_code != 200:
            raise RuntimeError(f"OpenCode API error ({resp.status_code}): {resp.text}")
        
        data = resp.json()
        choices = data.get("choices", [])
        if not choices:
            raise RuntimeError(f"OpenCode API returned no choices: {data}")
            
        msg = choices[0].get("message", {})
        content = msg.get("content") or ""
        if not content.strip() and msg.get("reasoning_content"):
            content = msg.get("reasoning_content") or ""
            
        if not content.strip():
            raise RuntimeError(f"OpenCode API returned empty content. Full response: {data}")
            
        return content.strip()

    def _prepare_context_chunks(self, pages: List[Dict[str, Any]], max_chars: int = 6000) -> str:
        total_p = len(pages)
        if total_p == 0:
            return ""
        
        step = max(1, total_p // 8)
        selected_pages = pages[0::step][:8]
        
        chunks = []
        for p in selected_pages:
            p_text = p.get("text", "").strip()
            p_text = re.sub(r'\s+', ' ', p_text)
            chunks.append(f"[Page {p.get('page_number')}]: {p_text[:600]}")
            
        full_context = "\n\n".join(chunks)
        return full_context[:max_chars]

    def generate_section_a(
        self,
        subject_name: str,
        subject_code: str,
        context_text: str,
        set_name: str,
        is_bilingual: bool = True,
        avoid_questions: Optional[List[str]] = None
    ) -> List[Question]:
        avoid_clause = ""
        if avoid_questions:
            avoid_clause = f"Avoid testing identical definitions/concepts as these existing questions from partner set:\n" + "\n".join([f"- {q}" for q in avoid_questions[:10]])

        prompt = f"""
Subject: {subject_name} ({subject_code})
Level: Master of Arts (MA 3rd Semester)
Set: Set {set_name}

Generate exactly 12 concise 2-mark short questions for Section A (Question 1, subquestions (i) to (xii)).
- Each question must be 1 to 2 lines, testing definitions, basic terms, or key theoretical distinctions.
- Never use inner double quotes in question text; use single quotes like 'unit act'.
{"- BILINGUAL: Provide 'en' and accurate academic Hindi translation in Devanagari script 'hi' for EVERY question." if is_bilingual else "- ENGLISH ONLY: Provide 'en'. Leave 'hi' blank."}
{avoid_clause}

Ground questions in these course notes:
{context_text}

Respond STRICTLY in valid JSON:
{{
  "questions": [
    {{"number": 1, "marks": 2, "en": "...", "hi": "...", "topic": "..."}}
  ]
}}
"""
        res = self._call_llm(prompt)
        data = parse_model_json(res)
        items = data.get("questions", [])
        questions = []
        for idx, it in enumerate(items[:12]):
            questions.append(Question(
                section="A",
                number=idx + 1,
                marks=2,
                en=it.get("en", "").strip(),
                hi=it.get("hi", "").strip() if is_bilingual else "",
                topic=it.get("topic", ""),
                difficulty="easy",
                set_name=set_name
            ))
        return questions

    def generate_section_b(
        self,
        subject_name: str,
        subject_code: str,
        context_text: str,
        set_name: str,
        b_marks: int = 6,
        is_bilingual: bool = True,
        avoid_questions: Optional[List[str]] = None
    ) -> List[Question]:
        avoid_clause = ""
        if avoid_questions:
            avoid_clause = f"Avoid testing the same specific theorists or themes as:\n" + "\n".join([f"- {q}" for q in avoid_questions[:8]])

        prompt = f"""
Subject: {subject_name} ({subject_code})
Level: Master of Arts (MA 3rd Semester)
Set: Set {set_name}

Generate exactly 6 medium analytical questions for Section B (Questions 2 to 7).
- Each carries {b_marks} marks.
- Questions should test comparative analysis, theoretical frameworks, or institutional dynamics.
- Never use inner double quotes in question text; use single quotes.
{"- BILINGUAL: Provide 'en' and accurate academic Hindi translation in Devanagari script 'hi' for EVERY question." if is_bilingual else "- ENGLISH ONLY: Provide 'en'. Leave 'hi' blank."}
{avoid_clause}

Ground questions in these course notes:
{context_text}

Respond STRICTLY in valid JSON:
{{
  "questions": [
    {{"number": 1, "marks": {b_marks}, "en": "...", "hi": "...", "topic": "..."}}
  ]
}}
"""
        res = self._call_llm(prompt)
        data = parse_model_json(res)
        items = data.get("questions", [])
        questions = []
        for idx, it in enumerate(items[:6]):
            questions.append(Question(
                section="B",
                number=idx + 1,
                marks=b_marks,
                en=it.get("en", "").strip(),
                hi=it.get("hi", "").strip() if is_bilingual else "",
                topic=it.get("topic", ""),
                difficulty="medium",
                set_name=set_name
            ))
        return questions

    def generate_section_c(
        self,
        subject_name: str,
        subject_code: str,
        context_text: str,
        set_name: str,
        is_bilingual: bool = True,
        avoid_questions: Optional[List[str]] = None
    ) -> List[Question]:
        avoid_clause = ""
        if avoid_questions:
            avoid_clause = f"Avoid testing the same major essay topics as:\n" + "\n".join([f"- {q}" for q in avoid_questions[:4]])

        prompt = f"""
Subject: {subject_name} ({subject_code})
Level: Master of Arts (MA 3rd Semester)
Set: Set {set_name}

Generate exactly 2 comprehensive essay questions for Section C (Question 8 and Question 9).
- Each carries 20 marks.
- Deep, critical essay questions requiring synthesis and critical evaluation.
- Never use inner double quotes in question text; use single quotes.
{"- BILINGUAL: Provide 'en' and accurate academic Hindi translation in Devanagari script 'hi' for EVERY question." if is_bilingual else "- ENGLISH ONLY: Provide 'en'. Leave 'hi' blank."}
{avoid_clause}

Ground questions in these course notes:
{context_text}

Respond STRICTLY in valid JSON:
{{
  "questions": [
    {{"number": 1, "marks": 20, "en": "...", "hi": "...", "topic": "..."}},
    {{"number": 2, "marks": 20, "en": "...", "hi": "...", "topic": "..."}}
  ]
}}
"""
        res = self._call_llm(prompt)
        data = parse_model_json(res)
        items = data.get("questions", [])
        questions = []
        for idx, it in enumerate(items[:2]):
            questions.append(Question(
                section="C",
                number=idx + 1,
                marks=20,
                en=it.get("en", "").strip(),
                hi=it.get("hi", "").strip() if is_bilingual else "",
                topic=it.get("topic", ""),
                difficulty="hard",
                set_name=set_name
            ))
        return questions

    def generate_set_questions(
        self,
        subject_name: str,
        subject_code: str,
        notes_text_context: str,
        set_name: str = "A",
        marks_format: int = 70,
        is_bilingual: bool = True,
        avoid_questions: Optional[List[Dict[str, Any]]] = None,
        progress_cb: Optional[Callable[[str], None]] = None
    ) -> Dict[str, List[Question]]:
        b_marks = 6 if marks_format == 70 else 7
        avoid_en = [q.get("en", "") for q in avoid_questions] if avoid_questions else []

        if progress_cb: progress_cb(f"Generating Section A (12 questions) for Set {set_name}...")
        sec_a = self.generate_section_a(subject_name, subject_code, notes_text_context, set_name, is_bilingual, avoid_en)
        
        if progress_cb: progress_cb(f"Generating Section B (6 questions) for Set {set_name}...")
        sec_b = self.generate_section_b(subject_name, subject_code, notes_text_context, set_name, b_marks, is_bilingual, avoid_en)
        
        if progress_cb: progress_cb(f"Generating Section C (2 essay questions) for Set {set_name}...")
        sec_c = self.generate_section_c(subject_name, subject_code, notes_text_context, set_name, is_bilingual, avoid_en)

        return {
            "section_a": sec_a,
            "section_b": sec_b,
            "section_c": sec_c
        }

    def compute_overlap_percentage(self, set_a_questions: List[Question], set_b_questions: List[Question]) -> Tuple[float, List[Tuple[str, str, float]]]:
        def get_words(text: str) -> set:
            stop_words = {"what", "explain", "discuss", "describe", "critically", "analyze", "examine", "define", "according", "theory", "concept", "with", "from", "that", "this", "these", "those", "have", "been"}
            words = set(re.findall(r'[a-zA-Z]{4,}', text.lower()))
            return words - stop_words

        matches = []
        high_similarity_count = 0

        for q_b in set_b_questions:
            b_words = get_words(q_b.en)
            if not b_words:
                continue
            
            best_sim = 0.0
            best_match_q = None
            
            for q_a in set_a_questions:
                a_words = get_words(q_a.en)
                if not a_words:
                    continue
                intersection = b_words.intersection(a_words)
                union = b_words.union(a_words)
                jaccard = len(intersection) / len(union) if union else 0.0
                if jaccard > best_sim:
                    best_sim = jaccard
                    best_match_q = q_a

            if best_sim >= 0.38:
                high_similarity_count += 1
                matches.append((q_b.en, best_match_q.en if best_match_q else "", round(best_sim * 100, 1)))

        overlap_percent = round((high_similarity_count / max(1, len(set_b_questions))) * 100, 1)
        return overlap_percent, matches

    def edit_single_question(
        self,
        question: Question,
        instruction: str,
        subject_name: str,
        context_notes: str,
        is_bilingual: bool = True
    ) -> Question:
        prompt = f"""
You are refining a single university exam question for subject '{subject_name}'.
Original English: "{question.en}"
Original Hindi: "{question.hi}"
Section: {question.section}, Marks: {question.marks}

Professor's instruction: "{instruction}"

Source Notes Excerpt:
{context_notes[:2500]}

Please update the question according to the instruction.
Respond strictly in JSON:
{{
  "en": "Updated English question",
  "hi": "Updated Hindi translation in Devanagari",
  "topic": "Topic name"
}}
"""
        response_text = self._call_llm(prompt)
        data = parse_model_json(response_text)
        question.en = data.get("en", question.en).strip()
        if is_bilingual:
            question.hi = data.get("hi", question.hi).strip()
        if "topic" in data:
            question.topic = data["topic"]
        return question
