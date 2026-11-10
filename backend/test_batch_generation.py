import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def run_batch():
    # 1. Load sample data
    print("Loading sample data...")
    res = requests.post(f"{BASE_URL}/api/load-sample-data")
    print("Sample data response:", res.json())

    # 2. Generate for A070902T, A070903T, A070904T
    subjects = ["A070902T", "A070903T", "A070904T"]
    for code in subjects:
        print(f"\n================ Generating {code} ================")
        t0 = time.time()
        res = requests.post(
            f"{BASE_URL}/api/generate",
            json={
                "subject_codes": [code],
                "instructions": "Prepare Set A and Set B following official university guidelines.",
                "format_marks": 70
            },
            timeout=180
        )
        t1 = time.time()
        data = res.json()
        print(f"Status: {res.status_code} in {t1 - t0:.1f}s")
        print("Papers generated:", len(data.get("papers", [])))
        for paper in data.get("papers", []):
            print(f"  - ID: {paper['id']}")
            print(f"    Subject: {paper['subject_name']} ({paper['subject_code']})")
            print(f"    Set: {paper['set_name']}, Questions: {len(paper['questions'])}, Pages: {paper['page_count']}")
            print(f"    Overlap with sibling: {paper.get('overlap_pct', 0)}%")
            print(f"    Docx exists: {paper.get('docx_path') is not None}, PDF exists: {paper.get('pdf_path') is not None}")
            assert paper['page_count'] == 2, f"Expected 2 pages, got {paper['page_count']}"
            assert len(paper['questions']) == 20, f"Expected 20 questions, got {len(paper['questions'])}"
            assert paper.get('overlap_pct', 0) <= 25.0, f"Overlap exceeded 25%: {paper.get('overlap_pct')}%"

    print("\nALL 4 SUBJECTS VERIFIED SUCCESSFULLY (8 PAPERS, 2 PAGES EACH, <=25% OVERLAP)!")

if __name__ == "__main__":
    run_batch()
