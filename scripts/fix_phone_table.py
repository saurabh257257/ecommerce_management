import requests
import re

API = "https://68.183.83.209.nip.io"

def fetch_all():
    all_c = []
    offset = 0
    while True:
        r = requests.get(f"{API}/api/crm/customers?limit=500&offset={offset}", timeout=60)
        data = r.json()
        batch = data.get('data', [])
        all_c.extend(batch)
        if len(batch) < 500:
            break
        offset += 500
    return all_c

customers = fetch_all()
print(f"Total customers: {len(customers)}")

fixed = 0
for c in customers:
    cid = c['id']
    try:
        phones = requests.get(f"{API}/api/crm/customers/{cid}/phones", timeout=10).json()
    except:
        continue
    if len(phones) < 2:
        continue

    # Find .0 dupes
    clean_map = {}
    to_delete = []
    for p in phones:
        num = p['phone'].strip()
        cleaned = re.sub(r'\.0$', '', num)
        cleaned = re.sub(r'[^\d]', '', cleaned)
        if len(cleaned) >= 10:
            cleaned = cleaned[-10:]
        if cleaned in clean_map:
            to_delete.append(p['id'])
        else:
            clean_map[cleaned] = p
            if num != cleaned and num.endswith('.0'):
                to_delete.append(p['id'])

    for pid in to_delete:
        try:
            requests.delete(f"{API}/api/crm/customers/{cid}/phones/{pid}", timeout=10)
            fixed += 1
        except:
            pass

    if to_delete:
        # Also fix the main phone field if it has .0
        main_phone = c.get('phone', '')
        if main_phone and ('.0' in main_phone or '/' in main_phone):
            clean_main = re.sub(r'\.0$', '', main_phone.split('/')[0].strip())
            clean_main = re.sub(r'[^\d]', '', clean_main)
            if len(clean_main) >= 10:
                clean_main = clean_main[-10:]
            body = dict(c)
            body['phone'] = clean_main
            for k in ('discussions', 'interests', 'tags'):
                body.pop(k, None)
            requests.put(f"{API}/api/crm/customers/{cid}", json=body, timeout=10)

    if fixed % 50 == 0 and fixed > 0:
        print(f"  Fixed {fixed}...")

print(f"Removed {fixed} bad phone entries")
