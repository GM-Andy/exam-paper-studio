import requests
import re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
r = requests.get('https://savee.com/i/yIOCOGs/', headers=headers, timeout=10)

for m in re.finditer(r'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*>', r.text):
    tag = m.group(0)
    val = m.group(1)
    if 'og:' in tag or 'twitter:' in tag or 'description' in tag:
        print(tag[:150])
