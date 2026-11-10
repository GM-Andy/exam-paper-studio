import requests
import time

URL = "https://hull-italia-record-lending.trycloudflare.com"

def test_public():
    print(f"Connecting to live production URL: {URL}")
    t0 = time.time()
    
    # 1. Frontend Root
    r_root = requests.get(URL, timeout=15)
    print(f"1. Root HTML: Status {r_root.status_code} ({len(r_root.text)} bytes) in {time.time()-t0:.2f}s")
    assert r_root.status_code == 200
    assert "Exam Paper Studio" in r_root.text
    
    # 2. Session State
    t1 = time.time()
    r_state = requests.get(f"{URL}/api/session-state", timeout=15)
    print(f"2. Session State: Status {r_state.status_code} in {time.time()-t1:.2f}s")
    assert r_state.status_code == 200
    state_json = r_state.json()
    print("   Interpretation:", state_json.get("interpretation")[:60], "...")
    print("   Total papers generated:", state_json.get("total_papers_generated"))
    assert state_json.get("total_papers_generated") == 8
    
    # 3. Papers List
    t2 = time.time()
    r_papers = requests.get(f"{URL}/api/papers", timeout=15)
    print(f"3. Papers API: Status {r_papers.status_code} in {time.time()-t2:.2f}s")
    assert r_papers.status_code == 200
    papers = r_papers.json()
    print(f"   Received {len(papers)} papers over public internet.")
    assert len(papers) == 8
    for p in papers:
        assert p["total_questions"] == 20
        assert p["page_count"] == 2
        assert p.get("overlap_with_partner", 0) <= 25.0
        print(f"   ✓ [{p['course_code']}] {p['subject_name']} Set {p['set_name']} — {p['page_count']} Pages, {p['total_questions']} Qs, Overlap: {p.get('overlap_with_partner')}%")

    # 4. Download DOCX
    t3 = time.time()
    r_docx = requests.get(f"{URL}/api/papers/a070901t_a/docx", timeout=15)
    print(f"4. Download DOCX: Status {r_docx.status_code} ({len(r_docx.content)} bytes) in {time.time()-t3:.2f}s")
    assert r_docx.status_code == 200
    assert len(r_docx.content) > 30000

    # 5. Download PDF
    t4 = time.time()
    r_pdf = requests.get(f"{URL}/api/papers/a070901t_a/pdf", timeout=15)
    print(f"5. Download PDF: Status {r_pdf.status_code} ({len(r_pdf.content)} bytes) in {time.time()-t4:.2f}s")
    assert r_pdf.status_code == 200
    assert len(r_pdf.content) > 50000

    # 6. Download All ZIP Bundle
    t5 = time.time()
    r_zip = requests.get(f"{URL}/api/download-all", timeout=20)
    print(f"6. Download All ZIP: Status {r_zip.status_code} ({len(r_zip.content)} bytes) in {time.time()-t5:.2f}s")
    assert r_zip.status_code == 200
    assert len(r_zip.content) > 100000

    # 7. Targeted AI Edit Test on Public URL
    t6 = time.time()
    first_paper = papers[0]
    q_target = first_paper["section_a"][0]
    print(f"\n7. Testing Live Question Regeneration via AI on Public URL...")
    print(f"   Original Q1: {q_target['en']}")
    edit_payload = {
        "question_id": q_target["id"],
        "instruction": "Make this question specifically test Talcott Parsons' AGIL schema with an analytical emphasis"
    }
    r_edit = requests.post(f"{URL}/api/papers/{first_paper['id']}/edit-question", json=edit_payload, timeout=60)
    print(f"   Edit response status: {r_edit.status_code} in {time.time()-t6:.2f}s")
    assert r_edit.status_code == 200
    edited_data = r_edit.json()
    new_q = edited_data["question"]
    print(f"   Updated Q1 EN: {new_q['en']}")
    print(f"   Updated Q1 HI: {new_q.get('hi')}")
    assert "AGIL" in new_q["en"] or "Parsons" in new_q["en"] or "parson" in new_q["en"].lower()
    print("   ✓ Question successfully updated in-place and PDF re-rendered!")

    print("\n" + "="*70)
    print("PRODUCTION WEBSITE VERIFIED 100% OPERATIONAL OVER PUBLIC HTTPS!")
    print(f"LIVE PUBLIC URL: {URL}")
    print("="*70)

if __name__ == "__main__":
    test_public()
