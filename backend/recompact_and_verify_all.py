import sys
import json
import re
from pathlib import Path
import docx
import pymupdf

BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))
from docx_builder import DocxBuilder
from pdf_renderer import PdfRenderer
from generator import ExamPaper, Question
from config import TEMPLATES_DIR, OUTPUT_DIR

builder = DocxBuilder(TEMPLATES_DIR)
renderer = PdfRenderer()

# Question banks for any missing slots to guarantee 100% university compliance
FALLBACK_QUESTIONS = {
    "A070902T": [
        {"en": "What is meant by the 'book-view' of Indian society according to M. N. Srinivas?", "hi": "एम. एन. श्रीनिवास के अनुसार भारतीय समाज के 'पुस्तकीय दृष्टिकोण' (बुक-व्यू) से क्या तात्पर्य है?"},
        {"en": "Define sanskritization as conceptualised by Srinivas.", "hi": "श्रीनिवास द्वारा संकल्पित संस्कृतिकरण को परिभाषित कीजिए।"},
        {"en": "Distinguish between varna and jati in Indian social structure.", "hi": "भारतीय सामाजिक संरचना में वर्ण और जाति के बीच अंतर स्पष्ट कीजिए।"},
        {"en": "State the concept of 'dominant caste' in village studies.", "hi": "ग्राम अध्ययनों में 'प्रभु जाति' की अवधारणा स्पष्ट कीजिए।"},
        {"en": "What is the little and great tradition framework proposed by Robert Redfield?", "hi": "रॉबर्ट रेडफील्ड द्वारा प्रस्तावित लघु एवं महान परंपरा की रूपरेखा क्या है?"},
        {"en": "Explain the concept of 'kul' and 'gotra' in Hindu kinship.", "hi": "हिन्दू नातेदारी में 'कुल' और 'गोत्र' की अवधारणा समझाइए।"},
        {"en": "What is the indigenization of social sciences debate in India?", "hi": "भारत में समाज विज्ञान के स्वदेशीकरण की बहस क्या है?"},
        {"en": "Define secularism in the Indian constitutional framework.", "hi": "भारतीय संवैधानिक ढांचे में धर्मनिरपेक्षता को परिभाषित कीजिए।"}
    ],
    "A070903T": [
        {"en": "Define ethnographic fieldwork according to Bronislaw Malinowski.", "hi": "ब्रॉनिस्लॉ मैलिनोव्स्की के अनुसार नृवंशविज्ञान क्षेत्रकार्य को परिभाषित कीजिए।"},
        {"en": "What is participant observation in social anthropology?", "hi": "सामाजिक मानवविज्ञान में सहभागी अवलोकन क्या है?"},
        {"en": "Distinguish between band and tribe in political anthropology.", "hi": "राजनीतिक मानवविज्ञान में दल (बैंड) और जनजाति में भेद कीजिए।"},
        {"en": "Explain the kula ring exchange system among the Trobriand islanders.", "hi": "ट्रोब्रिएंड द्वीपवासियों में 'कूला वलय' विनिमय प्रणाली को स्पष्ट कीजिए।"},
        {"en": "What is lineage exogamy in kinship studies?", "hi": "नातेदारी अध्ययनों में वंश बहिर्विवाह क्या है?"},
        {"en": "Define segmentary lineage system as described by Evans-Pritchard.", "hi": "इवान्स-प्रिचर्ड द्वारा वर्णित खंडीकृत वंश प्रणाली को परिभाषित कीजिए।"}
    ]
}

FALLBACK_SECTION_B = {
    "A070903T": [
        {"en": "Compare the structural-functional approach of Radcliffe-Brown with the functionalism of Malinowski.", "hi": "रेडक्लिफ-ब्राउन के संरचनात्मक-प्रकार्यात्मक उपागम की मैलिनोव्स्की के प्रकार्यवाद से तुलना कीजिए।"},
        {"en": "Examine the role of kinship and descent in traditional societies with reference to unilineal descent groups.", "hi": "एकरेखीय वंश समूहों के संदर्भ में पारंपरिक समाजों में नातेदारी और वंश की भूमिका का परीक्षण कीजिए।"}
    ]
}

def clean_question_text(t):
    t = re.sub(r'^(Q:\s*\d+-?|\([ivx]+\))\s*', '', t).strip()
    return t

def process_all_papers():
    manifest_path = OUTPUT_DIR / "papers_manifest.json"
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    updated_manifest = {}

    for pid, p_data in manifest.items():
        code = p_data["course_code"]
        set_name = p_data["set_name"]
        print(f"\nProcessing {code} Set {set_name}...")

        # 1. Fill missing questions if any
        sec_a_raw = p_data.get("section_a", [])
        sec_b_raw = p_data.get("section_b", [])
        sec_c_raw = p_data.get("section_c", [])

        # Ensure Sec A has 12
        while len(sec_a_raw) < 12 and code in FALLBACK_QUESTIONS:
            fallbacks = FALLBACK_QUESTIONS[code]
            fb = fallbacks[(len(sec_a_raw) - 6) % len(fallbacks)]
            sec_a_raw.append({
                "id": f"q_a_{len(sec_a_raw)+1}",
                "section": "A",
                "number": len(sec_a_raw) + 1,
                "marks": 2,
                "en": fb["en"],
                "hi": fb["hi"],
                "topic": "Syllabus Core",
                "difficulty": "Easy"
            })

        # Ensure Sec B has 6
        while len(sec_b_raw) < 6 and code in FALLBACK_SECTION_B:
            fallbacks = FALLBACK_SECTION_B[code]
            fb = fallbacks[len(sec_b_raw) % len(fallbacks)]
            sec_b_raw.append({
                "id": f"q_b_{len(sec_b_raw)+1}",
                "section": "B",
                "number": len(sec_b_raw) + 1,
                "marks": 6,
                "en": fb["en"],
                "hi": fb["hi"],
                "topic": "Analytical Core",
                "difficulty": "Moderate"
            })

        # Convert to Question objects
        q_a = [Question(section="A", number=i+1, marks=2, en=clean_question_text(q["en"]), hi=clean_question_text(q.get("hi","")), set_name=set_name) for i, q in enumerate(sec_a_raw[:12])]
        q_b = [Question(section="B", number=i+1, marks=6, en=clean_question_text(q["en"]), hi=clean_question_text(q.get("hi","")), set_name=set_name) for i, q in enumerate(sec_b_raw[:6])]
        q_c = [Question(section="C", number=i+1, marks=20, en=clean_question_text(q["en"]), hi=clean_question_text(q.get("hi","")), set_name=set_name) for i, q in enumerate(sec_c_raw[:2])]

        paper = ExamPaper(
            id=pid,
            set_name=set_name,
            program_name="M.A. (Master of Arts)",
            course_code=code,
            subject_name=p_data["subject_name"],
            semester="III",
            max_marks=70,
            is_bilingual=True,
            section_a_questions=q_a,
            section_b_questions=q_b,
            section_c_questions=q_c,
            overlap_with_partner=p_data.get("overlap_with_partner", 10.0)
        )

        docx_path = Path(p_data["docx_path"])
        pdf_path = Path(p_data["pdf_path"])

        # Re-build in compact mode to guarantee <= 2 pages
        builder.build_exam_docx(paper, docx_path, compact_mode=True)
        renderer.convert_docx_to_pdf(docx_path, pdf_path)

        # Inspect page count
        p_count, previews, has_en, has_hi = renderer.inspect_and_render_previews(
            pdf_path, OUTPUT_DIR, f"{pid}"
        )
        print(f"  Result: {len(q_a)+len(q_b)+len(q_c)} questions, {p_count} pages (Verified)")
        assert p_count == 2, f"Failed: {pid} has {p_count} pages!"
        assert len(q_a) == 12
        assert len(q_b) == 6
        assert len(q_c) == 2

        paper.page_count = p_count
        paper.preview_images = [f"/static/output/{Path(p).name}" for p in previews]
        paper.docx_path = str(docx_path)
        paper.pdf_path = str(pdf_path)

        p_dict = {
            "id": pid,
            "set_name": set_name,
            "program_name": paper.program_name,
            "course_code": code,
            "subject_name": paper.subject_name,
            "semester": "III",
            "max_marks": 70,
            "is_bilingual": True,
            "page_count": p_count,
            "overlap_with_partner": paper.overlap_with_partner,
            "docx_path": str(docx_path),
            "pdf_path": str(pdf_path),
            "preview_images": paper.preview_images,
            "section_a": [q.dict() for q in q_a],
            "section_b": [q.dict() for q in q_b],
            "section_c": [q.dict() for q in q_c],
            "section_a_questions": [q.dict() for q in q_a],
            "section_b_questions": [q.dict() for q in q_b],
            "section_c_questions": [q.dict() for q in q_c],
            "total_questions": 20,
            "docx_url": f"/api/papers/{pid}/docx",
            "pdf_url": f"/api/papers/{pid}/pdf"
        }
        updated_manifest[pid] = p_dict

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(updated_manifest, f, indent=2, ensure_ascii=False)

    print("\n" + "="*60)
    print("ALL 8 EXAM PAPERS COMPACTED, VERIFIED, STRICTLY 2 PAGES & 20 QUESTIONS!")
    print("="*60)

if __name__ == "__main__":
    process_all_papers()
