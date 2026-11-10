import os
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
import pymupdf
import docx

class IngestionEngine:
    def __init__(self):
        pass

    def extract_notes_from_pdf(self, file_path: Path) -> Dict[str, Any]:
        """
        Extracts structured text, units, and page references from a PDF.
        """
        doc = pymupdf.open(str(file_path))
        total_pages = len(doc)
        
        pages_content = []
        full_text_list = []
        units_found = []
        
        unit_pattern = re.compile(r'(UNIT\s*[-–—:]*\s*[I|V|X|0-9]+[^\n]*)', re.IGNORECASE)
        
        for p_idx in range(total_pages):
            page = doc[p_idx]
            text = page.get_text()
            pages_content.append({
                "page_number": p_idx + 1,
                "text": text
            })
            full_text_list.append(text)
            
            # Detect units
            for line in text.splitlines():
                line_str = line.strip()
                if unit_pattern.match(line_str) and len(line_str) < 60:
                    units_found.append({
                        "unit_title": line_str,
                        "page_number": p_idx + 1
                    })

        # Deduplicate units by title
        dedup_units = []
        seen = set()
        for u in units_found:
            clean_title = re.sub(r'\s+', ' ', u["unit_title"]).upper()
            if clean_title not in seen:
                seen.add(clean_title)
                dedup_units.append(u)

        # Subject title inference from filename or first page
        filename = file_path.stem
        first_page_text = pages_content[0]["text"] if pages_content else ""

        return {
            "file_name": file_path.name,
            "total_pages": total_pages,
            "units": dedup_units,
            "pages": pages_content,
            "first_page_preview": first_page_text[:500],
            "raw_text": "\n".join(full_text_list)
        }

    def extract_guidelines(self, file_path: Path) -> Dict[str, Any]:
        """
        Extracts examination rules, mark scheme, and instructions from guidelines docx/pdf.
        """
        rules = {
            "sets": ["A", "B"],
            "max_overlap_percent": 25.0,
            "min_difference_percent": 75.0,
            "marks_format": 70, # default for master courses
            "max_pages": 2,
            "languages": {
                "bilingual_courses": ["MA", "BA", "BJMC", "MJMC", "LLB", "BA LLB"],
                "english_only_courses": ["BCA", "MCA", "BBA", "MBA", "BCOM", "MCOM", "BSC", "MSC", "B TECH", "B PHARMACY"]
            },
            "fonts": {
                "english": {"name": "Times New Roman", "size_pt": 10},
                "hindi": {"name": "Mangal", "size_pt": 12}
            },
            "subjects_detected": [],
            "raw_text": ""
        }

        if file_path.suffix.lower() == ".docx":
            doc = docx.Document(str(file_path))
            full_text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
            
            # Extract tables (e.g. subject list tables)
            for table in doc.tables:
                for row in table.rows:
                    cells = [c.text.strip() for c in row.cells]
                    if len(cells) >= 2:
                        code, name = cells[0], cells[1]
                        if code and name and code != name:
                            rules["subjects_detected"].append({
                                "code": code,
                                "name": name
                            })
        else:
            pdf_doc = pymupdf.open(str(file_path))
            full_text = "\n".join([p.get_text() for p in pdf_doc])

        rules["raw_text"] = full_text

        # Heuristic checks on guidelines text
        if "75 marks format" in full_text.lower() and "70 marks" not in full_text.lower():
            rules["marks_format"] = 75
        elif "70 marks format" in full_text.lower() or "master courses" in full_text.lower():
            rules["marks_format"] = 70

        if "2 pages" in full_text.lower() or "two pages" in full_text.lower():
            rules["max_pages"] = 2

        return rules

    def match_notes_to_subjects(self, notes_list: List[Dict[str, Any]], subjects_list: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        """
        Associates each notes document with the correct subject code and name.
        """
        matched = []
        for note in notes_list:
            fname = note["file_name"].lower()
            matched_subj = None
            
            for subj in subjects_list:
                s_name = subj["name"].lower()
                s_code = subj["code"].lower()
                # Check code or keywords in subject name
                keywords = [w for w in re.split(r'[\s_&,-]+', s_name) if len(w) > 3]
                if s_code in fname or any(kw in fname for kw in keywords):
                    matched_subj = subj
                    break
            
            # If no match from subject list, infer from file name
            if not matched_subj:
                clean_name = note["file_name"].replace(".pdf", "").replace(".docx", "")
                matched_subj = {"code": "GEN001", "name": clean_name}

            matched.append({
                "subject_code": matched_subj["code"],
                "subject_name": matched_subj["name"],
                "note_info": note
            })
        return matched
