import requests
import json
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"

def verify():
    res = requests.get(f"{BASE_URL}/api/papers").json()
    print(f"Total Papers in System: {len(res)}\n")
    
    assert len(res) >= 8, f"Expected at least 8 papers, found {len(res)}"
    
    by_subject = {}
    for p in res:
        code = p["course_code"]
        by_subject.setdefault(code, []).append(p)
        
    for code, papers in sorted(by_subject.items()):
        print(f"=== Subject: {code} ({papers[0]['subject_name']}) ===")
        sets = {p["set_name"]: p for p in papers}
        assert "A" in sets, f"Missing Set A for {code}"
        assert "B" in sets, f"Missing Set B for {code}"
        
        for s_name in ["A", "B"]:
            p = sets[s_name]
            print(f"  [Set {s_name}]")
            print(f"    - ID: {p['id']}")
            print(f"    - Questions: {len(p['questions'])} (Expected 20)")
            assert len(p['questions']) == 20, f"Expected 20 questions, got {len(p['questions'])}"
            
            # Check sections: 12 in A, 6 in B, 2 in C
            sec_a = [q for q in p['questions'] if q['section'] == 'A']
            sec_b = [q for q in p['questions'] if q['section'] == 'B']
            sec_c = [q for q in p['questions'] if q['section'] == 'C']
            assert len(sec_a) == 12, f"Section A has {len(sec_a)} questions"
            assert len(sec_b) == 6, f"Section B has {len(sec_b)} questions"
            assert len(sec_c) == 2, f"Section C has {len(sec_c)} questions"
            print(f"    - Structure: Sec A={len(sec_a)} (2m), Sec B={len(sec_b)} (6m), Sec C={len(sec_c)} (20m) -> 70 Marks")
            
            # Check bilingual
            bilingual_count = sum(1 for q in p['questions'] if q.get('hi') and len(q['hi'].strip()) > 0)
            print(f"    - Bilingual Questions: {bilingual_count}/20")
            assert bilingual_count == 20, f"Expected 20 bilingual questions, got {bilingual_count}"
            
            # Check pages
            print(f"    - Verified Page Count: {p['page_count']} Pages (Strict <= 2 rule)")
            assert p['page_count'] == 2, f"Expected 2 pages, got {p['page_count']}"
            
            # Check preview thumbnails
            print(f"    - Preview Images: {len(p.get('preview_images', []))} thumbnails generated")
            assert len(p.get('preview_images', [])) == 2
            
            # Check overlap
            print(f"    - Overlap with partner set: {p.get('overlap_with_partner', 0)}% (Max permitted: 25.0%)")
            assert p.get('overlap_with_partner', 0) <= 25.0
            
            # Check files exist on disk
            docx_path = Path(p['docx_path'])
            pdf_path = Path(p['pdf_path'])
            assert docx_path.exists(), f"DOCX file missing: {docx_path}"
            assert pdf_path.exists(), f"PDF file missing: {pdf_path}"
            print(f"    - DOCX Size: {docx_path.stat().st_size} bytes")
            print(f"    - PDF Size: {pdf_path.stat().st_size} bytes")
        print()

    print("================================================================")
    print("ALL 8 EXAM PAPERS COMPLETED, VERIFIED, AND FULLY COMPLIANT!")
    print("================================================================")

if __name__ == "__main__":
    verify()
