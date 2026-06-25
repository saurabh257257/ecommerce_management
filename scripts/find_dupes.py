import requests
import re
import json

API = "https://68.183.83.209.nip.io"

def fetch_all():
    r = requests.get(f"{API}/api/crm/customers", timeout=30)
    data = r.json()
    return data.get('data', []) if isinstance(data, dict) else data

def normalize_name(n):
    return re.sub(r'[^a-z0-9]', '', str(n).lower().strip())

if __name__ == '__main__':
    customers = fetch_all()
    print(f"Total contacts: {len(customers)}\n")

    # Group by normalized name
    name_groups = {}
    for c in customers:
        key = normalize_name(c.get('name', ''))
        if key and len(key) > 2:
            name_groups.setdefault(key, []).append(c)

    dupes = {k: v for k, v in name_groups.items() if len(v) > 1}
    print(f"Names appearing more than once: {len(dupes)}")
    total_extra = sum(len(v) - 1 for v in dupes.values())
    print(f"Extra records to remove: {total_extra}\n")

    # Show some examples
    print("=== Sample duplicates (first 20) ===")
    for i, (key, group) in enumerate(list(dupes.items())[:20]):
        print(f"\n  Name: {group[0]['name']}")
        for c in group:
            print(f"    ID={c['id']}  phone={c.get('phone','')}  type={c.get('customer_type','')}  status={c.get('status','')}  source={c.get('source','')}")
