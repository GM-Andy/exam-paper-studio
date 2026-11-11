import copy
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
import docx
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

from generator import Question, ExamPaper

def set_font_run(run, font_name: str, size_pt: float, bold: bool = False, is_complex_script: bool = False):
    run.font.name = font_name
    run.font.size = Pt(size_pt)
    run.bold = bold
    
    # Set OOXML complex script font tags for perfect Word Hindi rendering
    rPr = run._r.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
        
    if is_complex_script:
        rFonts.set(qn('w:cs'), font_name)
        # In half-points (12 pt = 24)
        szCs = rPr.find(qn('w:szCs'))
        if szCs is None:
            szCs = OxmlElement('w:szCs')
            rPr.append(szCs)
        szCs.set(qn('w:val'), str(int(size_pt * 2)))
    else:
        rFonts.set(qn('w:ascii'), font_name)
        rFonts.set(qn('w:hAnsi'), font_name)

class DocxBuilder:
    def __init__(self, template_dir: Path):
        self.template_dir = template_dir

    def get_template_path(self, marks: int = 70) -> Path:
        target_name = "75 MARKS PAPER FORMAT.docx" if marks == 75 else "70 MARKS PAPER FORMAT.docx"
        
        candidates = [
            self.template_dir / target_name,
            Path(__file__).resolve().parent / "templates" / target_name,
            Path(__file__).resolve().parent.parent / "templates" / target_name,
            Path(r"C:\Users\anaha\mpk\EXAM PAPER MAKING SYSTEM\EXAM GUIDELINES AND PAPER FORMATS") / target_name
        ]
        for c in candidates:
            if c.exists():
                return c
        raise FileNotFoundError(f"Template {target_name} not found in any candidates: {candidates}")

    def generate_paper(
        self,
        paper: ExamPaper,
        output_path: Optional[Path] = None,
        template_override_path: Optional[Path] = None,
        compact_mode: bool = True
    ) -> Path:
        """
        High-level wrapper to generate the official university DOCX document for an ExamPaper.
        If output_path is omitted, creates a file in OUTPUT_DIR or paper.docx_path or /tmp.
        """
        if output_path is None:
            if paper.docx_path:
                output_path = Path(paper.docx_path)
            else:
                from config import OUTPUT_DIR
                clean_subj = "".join([c if c.isalnum() or c in " -_" else "" for c in paper.subject_name]).replace(" ", "_")
                clean_prog = "".join([c if c.isalnum() else "" for c in paper.program_name])
                clean_sem = "".join([c if c.isalnum() else "" for c in paper.semester])
                filename = f"Set_{paper.set_name}_{paper.course_code}_{clean_subj}_{clean_prog}_Sem_{clean_sem}.docx"
                output_path = OUTPUT_DIR / filename
                
        output_path.parent.mkdir(parents=True, exist_ok=True)
        res_path = self.build_exam_docx(
            paper=paper,
            output_path=output_path,
            template_override_path=template_override_path,
            compact_mode=compact_mode
        )
        paper.docx_path = str(res_path)
        return res_path

    def build_exam_docx(
        self,
        paper: ExamPaper,
        output_path: Path,
        template_override_path: Optional[Path] = None,
        compact_mode: bool = False
    ) -> Path:
        """
        Populates the official university docx template preserving tables, logo, layout, and styling.
        """
        template_path = template_override_path if template_override_path and template_override_path.exists() else self.get_template_path(paper.max_marks)
        doc = Document(str(template_path))
        
        # 1. Update Title paragraph to include SET A / B
        for p in doc.paragraphs:
            if "END SEMESTER EXAMINATION" in p.text:
                # Keep text and append SET
                p.text = f"END SEMESTER EXAMINATION- {paper.exam_date_str}  (SET - {paper.set_name})"
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    set_font_run(r, "Times New Roman", 13.0, bold=True)
                break

        # 2. Update Header Table (Table 0)
        if len(doc.tables) > 0:
            table = doc.tables[0]
            # Row 0: Program Name & Semester
            if len(table.rows) > 0 and len(table.rows[0].cells) >= 2:
                c0 = table.rows[0].cells[0]
                c1 = table.rows[0].cells[1]
                c0.text = f"Program Name: {paper.program_name}"
                c1.text = f"Semester: {paper.semester}"
                for c in [c0, c1]:
                    for p in c.paragraphs:
                        for r in p.runs:
                            set_font_run(r, "Times New Roman", 9.5, bold=True)

            # Row 1: Subject Name & Paper Code
            if len(table.rows) > 1 and len(table.rows[1].cells) >= 2:
                c0 = table.rows[1].cells[0]
                c1 = table.rows[1].cells[1]
                c0.text = f"Subject Name: {paper.subject_name}"
                c1.text = f"Paper Code: {paper.course_code}"
                for c in [c0, c1]:
                    for p in c.paragraphs:
                        for r in p.runs:
                            set_font_run(r, "Times New Roman", 9.5, bold=True)

            # Row 2: Time & Max Marks
            if len(table.rows) > 2 and len(table.rows[2].cells) >= 2:
                c0 = table.rows[2].cells[0]
                c1 = table.rows[2].cells[1]
                c0.text = f"Time: {paper.time_allowed}"
                c1.text = f"Max Marks: {paper.max_marks}"
                for c in [c0, c1]:
                    for p in c.paragraphs:
                        for r in p.runs:
                            set_font_run(r, "Times New Roman", 9.5, bold=True)

            # Ensure row 3 instructions have clean 8.5 pt font
            if len(table.rows) > 3:
                for c in table.rows[3].cells:
                    for p in c.paragraphs:
                        p.paragraph_format.line_spacing = 1.05
                        p.paragraph_format.space_after = Pt(1)
                        for r in p.runs:
                            set_font_run(r, "Times New Roman", 8.5, bold=False)

        # 3. Locate Sections in Document Body
        # We need to replace empty question slots with generated questions
        # Spacing parameters (tighten in compact mode to ensure 2 pages)
        space_after_q = Pt(0.5) if compact_mode else Pt(2.0)
        line_spacing = 1.0 if compact_mode else 1.12
        en_font_size = 9.5 if compact_mode else 10.0
        hi_font_size = 11.0 if compact_mode else 12.0

        # Sub-question roman numerals for Section A
        roman_nums = ["(i)", "(ii)", "(iii)", "(iv)", "(v)", "(vi)", "(vii)", "(viii)", "(ix)", "(x)", "(xi)", "(xii)"]

        # Strategy: find paragraphs and insert questions deterministically
        # Find index of Section A, Section B, Section C
        sec_a_idx = -1
        sec_b_idx = -1
        sec_c_idx = -1
        
        for idx, p in enumerate(doc.paragraphs):
            t = p.text.lower()
            if "section – a" in t or "section - a" in t:
                sec_a_idx = idx
            elif "section – b" in t or "section - b" in t:
                sec_b_idx = idx
            elif "section – c" in t or "section - c" in t:
                sec_c_idx = idx

        # If standard headings exist, we clear out placeholders between them and insert questions cleanly
        # Let's inspect paragraphs from doc
        # We can construct the document body cleanly after the table and title!
        
        # In the original template:
        # Paragraphs up to Section A header: Logo, Title, Student Info, Spacers.
        # We preserve everything up to sec_a_idx!
        # Then we populate Section A questions, then Section B header + questions, then Section C header + questions, then '*******'
        
        # Let's clear paragraphs from sec_a_idx + 1 onwards and recreate them with exact formatting
        # Keep headers
        sec_a_heading = doc.paragraphs[sec_a_idx].text if sec_a_idx != -1 else f"Section – A: Attempt any ten questions out of twelve. Each question carries 2 marks.                             [20 marks]"
        sec_b_heading = doc.paragraphs[sec_b_idx].text if sec_b_idx != -1 else f"Section – B:  Attempt any five questions out of six. Each question carries {6 if paper.max_marks==70 else 7} marks.       	                            [{30 if paper.max_marks==70 else 35} Marks]"
        sec_c_heading = doc.paragraphs[sec_c_idx].text if sec_c_idx != -1 else f"Section – C: Attempt any one question out of two. Each question carries 20 marks.                                    [20 marks]"

        # Remove paragraphs from sec_a_idx onwards
        p_elements_to_remove = [p._p for p in doc.paragraphs[sec_a_idx:]]
        for p_elem in p_elements_to_remove:
            p_elem.getparent().remove(p_elem)

        # Helper to add a formatted question paragraph
        def add_question_paragraph(q_label: str, en_text: str, hi_text: str = ""):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = space_after_q
            p.paragraph_format.line_spacing = line_spacing
            
            # English label
            r_label = p.add_run(q_label + " ")
            set_font_run(r_label, "Times New Roman", en_font_size, bold=True)
            
            # English text
            r_en = p.add_run(en_text)
            set_font_run(r_en, "Times New Roman", en_font_size, bold=False)
            
            # Hindi text (placed on new line)
            if hi_text:
                p.add_run("\n")
                # Indent slightly for Hindi
                r_hi_indent = p.add_run("   ")
                set_font_run(r_hi_indent, "Times New Roman", en_font_size, bold=False)
                
                r_hi = p.add_run(hi_text)
                set_font_run(r_hi, "Mangal", hi_font_size, bold=False, is_complex_script=True)

        # Helper to add section header
        def add_section_header(title: str):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(3)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.1
            r = p.add_run(title)
            set_font_run(r, "Times New Roman", 10.0, bold=True)

        # 4. Add Section A
        add_section_header(sec_a_heading)
        
        # Add Q: 1- introductory label
        p_q1 = doc.add_paragraph()
        p_q1.paragraph_format.space_before = Pt(0)
        p_q1.paragraph_format.space_after = Pt(1)
        r_q1 = p_q1.add_run("Q: 1-")
        set_font_run(r_q1, "Times New Roman", 10.0, bold=True)
        
        for idx, q in enumerate(paper.section_a_questions):
            roman = roman_nums[idx] if idx < len(roman_nums) else f"({idx+1})"
            add_question_paragraph(roman, q.en, q.hi if paper.is_bilingual else "")

        # 5. Add Section B
        add_section_header(sec_b_heading)
        for idx, q in enumerate(paper.section_b_questions):
            q_num_label = f"Q: {idx + 2}-"
            add_question_paragraph(q_num_label, q.en, q.hi if paper.is_bilingual else "")

        # 6. Add Section C
        add_section_header(sec_c_heading)
        for idx, q in enumerate(paper.section_c_questions):
            q_num_label = f"Q: {idx + 8}-"
            add_question_paragraph(q_num_label, q.en, q.hi if paper.is_bilingual else "")

        # Adjust margins in compact mode to guarantee <= 2 pages
        if compact_mode:
            from docx.shared import Inches
            for s in doc.sections:
                s.top_margin = Inches(0.4)
                s.bottom_margin = Inches(0.2)
                s.left_margin = Inches(0.45)
                s.right_margin = Inches(0.45)

        # 7. Add End Star line
        p_end = doc.add_paragraph()
        p_end.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_end.paragraph_format.space_before = Pt(1)
        p_end.paragraph_format.space_after = Pt(0)
        p_end.paragraph_format.line_spacing = 1.0
        r_end = p_end.add_run("*******")
        set_font_run(r_end, "Times New Roman", 10.0, bold=False)

        # Save DOCX safely
        output_path.parent.mkdir(parents=True, exist_ok=True)
        import os
        import tempfile
        import shutil
        import time
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".docx", dir=str(output_path.parent))
        os.close(tmp_fd)
        doc.save(tmp_path)
        # Attempt move with quick retry if Windows antivirus or indexer holds a brief lock
        for attempt in range(5):
            try:
                shutil.move(tmp_path, str(output_path))
                break
            except Exception:
                time.sleep(0.5)
        return output_path
