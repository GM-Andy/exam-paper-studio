import requests

r = requests.get("http://127.0.0.1:8000/api/papers").json()
print("Number of papers returned by /api/papers:", len(r))
for p in r:
    print(f"[{p['course_code']}] {p['subject_name']} Set {p['set_name']} | Qs: {p['total_questions']} | Pages: {p['page_count']} | Overlap: {p.get('overlap_with_partner')}%")
