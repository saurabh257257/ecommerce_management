import requests
import re

API = "https://68.183.83.209.nip.io"

def fetch_all():
    r = requests.get(f"{API}/api/crm/customers", timeout=60)
    data = r.json()
    return data.get('data', []) if isinstance(data, dict) else data

def fix_phone(p):
    if not p:
        return p
    p = str(p).strip()
    if p.endswith('.0'):
        p = p[:-2]
    p = re.sub(r'[^\d]', '', p)
    if len(p) > 10:
        p = p[-10:]
    return p

if __name__ == '__main__':
    customers = fetch_all()
    print(f"Total: {len(customers)}")

    to_fix = []
    for c in customers:
        phone = str(c.get('phone', '')).strip()
        fixed = fix_phone(phone)
        if fixed != phone:
            to_fix.append((c, fixed))

    print(f"Phones to fix: {len(to_fix)}")

    fixed_count = 0
    for c, new_phone in to_fix:
        body = dict(c)
        body['phone'] = new_phone
        for k in ('discussions', 'interests', 'tags'):
            body.pop(k, None)
        try:
            r = requests.put(f"{API}/api/crm/customers/{c['id']}", json=body, timeout=10)
            if r.status_code == 200:
                fixed_count += 1
        except:
            pass

    print(f"Fixed: {fixed_count}")
