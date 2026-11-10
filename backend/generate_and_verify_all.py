import requests
import time
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"

def main():
    print("Step 1: Loading sample university materials...")
    res = requests.post(f"{BASE_URL}/api/load-sample-data")
    assert res.status_code == 200, f"Failed to load sample data: {res.text}"
    print("Sample data loaded successfully.")
    
    print("\nStep 2: Launching generation for all 4 MA Sociology subjects...")
    res = requests.post(
        f"{BASE_URL}/api/generate",
        json={
            "subject_codes": ["A070901T", "A070902T", "A070903T", "A070904T"],
            "format_marks": 70,
            "is_bilingual": True
        }
    )
    assert res.status_code == 200, f"Failed to start generation: {res.text}"
    print("Generation launched in background.")

    print("\nStep 3: Monitoring progress...")
    last_msg = ""
    start_time = time.time()
    while time.time() - start_time < 360:
        prog = requests.get(f"{BASE_URL}/api/progress").json()
        stage = prog.get("stage", "")
        pct = prog.get("percent", 0)
        msg = prog.get("message", "")
        if msg != last_msg:
            print(f"[{pct}%] {stage}: {msg}")
            last_msg = msg
        if stage == "completed":
            print("\nGeneration completed successfully!")
            break
        elif stage == "error":
            raise RuntimeError(f"Generation error: {msg}")
        time.sleep(3)

    print("\nStep 4: Comprehensive Verification of Generated Papers...")
    papers = requests.get(f"{BASE_URL}/api/papers").json()
    print(f"Total Papers in System: {len(papers)}")
    assert len(papers) == 8, f"Expected exactly 8 papers, got {len(papers)}"

    by_subject = {}
    for p in papers:
        by_subject.setdefault(p["course_code"], []).append(p)

    expected_subjects = ["A070901T", "A070902T", "A070903T", "A070904T"]
    for code in expected_subjects:
        assert code in by_subject, f"Missing subject {code}"
        subj_papers = by_subject[code]
        assert len(subj_papers) == 2, f"Expected 2 papers for {code}, got {len(subj_papers)}"
        
        sets = {p["set_name"]: p for p in subj_papers}
        assert "A" in sets and "B" in sets, f"Missing Set A or Set B for {code}"
        
        for s_name in ["A", "B"]:
            p = sets[s_name]
            print(f"\n--- [{p['course_code']}] {p['subject_name']} — Set {s_name} ---")
            print(f"  - Questions: {p['total_questions']} (Sec A: {len(p['section_a'])}, Sec B: {len(p['section_b'])}, Sec C: {len(p['section_c'])})")
            assert p['total_questions'] == 20
            assert len(p['section_a']) == 12
            assert len(p['section_b']) == 6
            assert len(p['section_c']) == 2
            
            # Bilingual check
            bi_a = sum(1 for q in p['section_a'] if q.get('hi') and len(q['hi'].strip()) > 0)
            bi_b = sum(1 for q in p['section_b'] if q.get('hi') and len(q['hi'].strip()) > 0)
            bi_c = sum(1 for q in p['section_c'] if q.get('hi') and len(q['hi'].strip()) > 0)
            print(f"  - Bilingual: {bi_a + bi_b + bi_c}/20 questions have Devanagari Hindi translations")
            assert (bi_a + bi_b + bi_c) == 20
            
            # Page count check
            print(f"  - Page Count: {p['page_count']} Pages (Strict <= 2 page requirement)")
            assert p['page_count'] == 2, f"Failed page constraint: {p['page_count']} pages"
            
            # Overlap check
            print(f"  - Sibling Overlap: {p['overlap_with_partner']}% (Max permitted: 25.0%)")
            assert p['overlap_with_partner'] <= 25.0

    print("\nStep 5: Testing Download All ZIP Bundle...")
    zip_res = requests.get(f"{BASE_URL}/api/download-all")
    assert zip_res.status_code == 200
    assert len(zip_res.content) > 100000, "ZIP bundle too small"
    print(f"ZIP Bundle downloaded successfully: {len(zip_res.content):,} bytes")

    print("\n" + "="*70)
    print("ALL 8 EXAMINATION PAPERS ACROSS ALL 4 SUBJECTS ARE 100% VERIFIED!")
    print("="*70)

if __name__ == "__main__":
    main()
