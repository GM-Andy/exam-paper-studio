import requests
import time

BASE_URL = "http://127.0.0.1:8000"

def poll_until_done(timeout=300):
    start = time.time()
    last_msg = ""
    while time.time() - start < timeout:
        res = requests.get(f"{BASE_URL}/api/progress").json()
        msg = res.get("message", "")
        if msg != last_msg:
            print(f"[{res.get('percent', 0)}%] {res.get('stage', '')}: {msg}")
            last_msg = msg
        if res.get("stage") == "done":
            return True
        time.sleep(2)
    return False

def check_papers():
    res = requests.get(f"{BASE_URL}/api/papers").json()
    print(f"\nTotal Papers in System: {len(res)}")
    by_subject = {}
    for p in res:
        code = p["course_code"]
        by_subject.setdefault(code, []).append(p)
        print(f"  - [{p['course_code']}] {p['subject_name']} — {p['set_name']}")
        print(f"    Pages: {p['page_count']}, Questions: {len(p.get('questions', []))}, Overlap: {p.get('overlap_with_partner', 0)}%")
        print(f"    Preview URLs: {p.get('preview_images')}")
        assert p['page_count'] == 2, f"Subject {code} {p['set_name']} has {p['page_count']} pages instead of 2!"
        assert len(p.get('questions', [])) == 20, f"Subject {code} {p['set_name']} has {len(p.get('questions', []))} questions!"
        assert p.get('overlap_with_partner', 0) <= 25.0, f"Subject {code} {p['set_name']} overlap exceeded 25%!"

    print("\nVerified all generated papers successfully!")

if __name__ == "__main__":
    print("Watching active background generation...")
    if poll_until_done():
        print("Generation finished!")
    check_papers()
