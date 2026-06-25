import requests
import re
import json
import time

API = "https://68.183.83.209.nip.io"

def fetch_all():
    r = requests.get(f"{API}/api/crm/customers", timeout=30)
    data = r.json()
    return data.get('data', []) if isinstance(data, dict) else data

def normalize_name(n):
    return re.sub(r'[^a-z0-9]', '', str(n).lower().strip())

def normalize_phone(p):
    s = re.sub(r'[^\d]', '', str(p).split('.')[0])
    return s[-10:] if len(s) >= 10 else s

def score(c):
    s = 0
    for f in ('email', 'city', 'state', 'remark', 'company', 'source', 'requirement'):
        if c.get(f) and str(c[f]).strip():
            s += 1
    ct = c.get('customer_type', '')
    if ct in ('Battery Manufacturer', 'Trader'):
        s += 3
    elif ct == 'Others':
        s += 1
    if c.get('status') and c['status'] not in ('Lead', ''):
        s += 2
    return s

def delete_customer(cid):
    r = requests.delete(f"{API}/api/crm/customers/{cid}", timeout=10)
    return r.status_code == 200

if __name__ == '__main__':
    customers = fetch_all()
    print(f"Total: {len(customers)}\n")

    # Group by normalized name
    name_groups = {}
    for c in customers:
        key = normalize_name(c.get('name', ''))
        if key and len(key) > 2:
            name_groups.setdefault(key, []).append(c)

    dupes = {k: v for k, v in name_groups.items() if len(v) > 1}

    # Filter: only merge if phones match (after normalization) OR one has a subset phone
    to_delete = []
    to_skip = []
    for key, group in dupes.items():
        phones = set()
        for c in group:
            p = normalize_phone(c.get('phone', ''))
            if p:
                phones.add(p)

        if len(phones) <= 1:
            # All same phone (or no phone) - clear duplicate
            group.sort(key=score, reverse=True)
            for c in group[1:]:
                to_delete.append(c)
        elif len(phones) == 2 and len(group) == 2:
            # 2 different phones, same name - could be same company with 2 numbers
            # Only merge if one record is clearly from same source pattern
            group.sort(key=score, reverse=True)
            for c in group[1:]:
                to_delete.append(c)
        else:
            # Multiple different phones - might be genuinely different businesses
            # Group by phone, delete within-phone dupes only
            phone_sub = {}
            for c in group:
                p = normalize_phone(c.get('phone', ''))
                phone_sub.setdefault(p, []).append(c)
            for p, sub in phone_sub.items():
                if len(sub) > 1:
                    sub.sort(key=score, reverse=True)
                    for c in sub[1:]:
                        to_delete.append(c)
            if any(len(sub) > 1 for sub in phone_sub.values()):
                pass  # handled above
            else:
                to_skip.append((key, group))

    print(f"Duplicate groups: {len(dupes)}")
    print(f"Records to delete: {len(to_delete)}")
    print(f"Ambiguous (different phones, skipped): {len(to_skip)}")

    if to_skip:
        print(f"\n=== Skipped ambiguous (first 10) ===")
        for key, group in to_skip[:10]:
            print(f"  {group[0]['name']}:")
            for c in group:
                print(f"    phone={c.get('phone','')}  source={c.get('source','')}")

    print(f"\nDeleting {len(to_delete)} duplicates...")
    deleted = 0
    errors = 0
    for c in to_delete:
        try:
            if delete_customer(c['id']):
                deleted += 1
            else:
                errors += 1
        except:
            errors += 1
        if deleted % 200 == 0 and deleted > 0:
            print(f"  Progress: {deleted}/{len(to_delete)}")

    print(f"Deleted: {deleted}, Errors: {errors}")

    final = fetch_all()
    print(f"\nFinal total: {len(final)}")
