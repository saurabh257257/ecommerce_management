import requests
import re
import json
import time

API = "https://68.183.83.209.nip.io"

def normalize_phone(p):
    if not p or not str(p).strip():
        return None
    s = re.sub(r'[^\d]', '', str(p))
    if len(s) >= 10:
        return s[-10:]
    return None

def fetch_all_customers():
    r = requests.get(f"{API}/api/crm/customers", timeout=30)
    data = r.json()
    if isinstance(data, dict):
        return data.get('data', [])
    return data

def delete_customer(cid):
    r = requests.delete(f"{API}/api/crm/customers/{cid}", timeout=10)
    return r.status_code == 200

def update_customer(cid, fields):
    r = requests.put(f"{API}/api/crm/customers/{cid}", json=fields, timeout=10)
    return r.status_code == 200

if __name__ == '__main__':
    print("=== Cleanup Script ===\n")

    print("1. Fetching all customers...")
    customers = fetch_all_customers()
    print(f"   Total: {len(customers)}")

    print("2. Finding duplicates by phone (last 10 digits)...")
    phone_groups = {}
    no_phone = []
    for c in customers:
        phone = normalize_phone(c.get('phone'))
        if phone:
            phone_groups.setdefault(phone, []).append(c)
        else:
            no_phone.append(c)

    duplicates = {k: v for k, v in phone_groups.items() if len(v) > 1}
    print(f"   Unique phones: {len(phone_groups)}")
    print(f"   Phones with duplicates: {len(duplicates)}")
    print(f"   Contacts without phone: {len(no_phone)}")

    total_to_delete = sum(len(v) - 1 for v in duplicates.values())
    print(f"   Total duplicate records to delete: {total_to_delete}")

    print("\n3. Deleting duplicates (keeping the one with most data)...")
    deleted = 0
    errors = 0
    for phone, group in duplicates.items():
        def score(c):
            s = 0
            for f in ('email', 'city', 'state', 'remark', 'company', 'source', 'customer_type'):
                if c.get(f) and str(c[f]).strip():
                    s += 1
            if c.get('status') and c['status'] not in ('Lead', ''):
                s += 2
            return s

        group.sort(key=score, reverse=True)
        keep = group[0]
        for dup in group[1:]:
            try:
                if delete_customer(dup['id']):
                    deleted += 1
                else:
                    errors += 1
            except Exception as e:
                errors += 1
                print(f"   Error deleting {dup['id']}: {e}")

        if deleted % 100 == 0 and deleted > 0:
            print(f"   Deleted {deleted}/{total_to_delete}...")

    print(f"   Deleted: {deleted}, Errors: {errors}")

    print("\n4. Fixing Onboarded status...")
    customers_after = fetch_all_customers()
    fixed = 0
    for c in customers_after:
        if c.get('status') == 'Customer':
            if update_customer(c['id'], {'status': 'Onboarded'}):
                fixed += 1
    print(f"   Fixed {fixed} contacts from 'Customer' to 'Onboarded'")

    print("\n5. Final count...")
    final = fetch_all_customers()
    status_counts = {}
    type_counts = {}
    for c in final:
        st = c.get('status', 'Unknown')
        ct = c.get('customer_type', 'Unknown')
        status_counts[st] = status_counts.get(st, 0) + 1
        type_counts[ct] = type_counts.get(ct, 0) + 1

    print(f"   Total contacts: {len(final)}")
    print(f"   By status: {json.dumps(status_counts, indent=4)}")
    print(f"   By type: {json.dumps(type_counts, indent=4)}")
    print("\n=== Done ===")
