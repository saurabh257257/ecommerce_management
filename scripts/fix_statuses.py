import requests
import json
import time

API = "https://68.183.83.209.nip.io"

def fetch_all():
    r = requests.get(f"{API}/api/crm/customers", timeout=30)
    data = r.json()
    return data.get('data', []) if isinstance(data, dict) else data

def update_field(customer, field, value):
    c = dict(customer)
    c[field] = value
    r = requests.put(f"{API}/api/crm/customers/{c['id']}", json=c, timeout=10)
    return r.status_code == 200

if __name__ == '__main__':
    print("Fetching all customers...")
    customers = fetch_all()
    print(f"Total: {len(customers)}\n")

    # Fix "Customer" -> "Onboarded"
    fixed_status = 0
    for c in customers:
        if c.get('status') == 'Customer':
            if update_field(c, 'status', 'Onboarded'):
                fixed_status += 1
                print(f"  Fixed status: {c['name']} ({c['id']})")
    print(f"Fixed {fixed_status} 'Customer' -> 'Onboarded'\n")

    # Fix "Battery Industry" -> "Others"
    fixed_type = 0
    for c in customers:
        if c.get('customer_type') == 'Battery Industry':
            if update_field(c, 'customer_type', 'Others'):
                fixed_type += 1
    print(f"Fixed {fixed_type} 'Battery Industry' -> 'Others'\n")

    # Fix empty customer_type -> "Others"
    fixed_empty = 0
    for c in customers:
        if not c.get('customer_type') or c.get('customer_type', '').strip() == '':
            if update_field(c, 'customer_type', 'Others'):
                fixed_empty += 1
    print(f"Fixed {fixed_empty} empty type -> 'Others'\n")

    # Final tally
    customers2 = fetch_all()
    status_counts = {}
    type_counts = {}
    for c in customers2:
        st = c.get('status', 'Unknown')
        ct = c.get('customer_type', 'Unknown')
        status_counts[st] = status_counts.get(st, 0) + 1
        type_counts[ct] = type_counts.get(ct, 0) + 1
    print(f"Final total: {len(customers2)}")
    print(f"Statuses: {json.dumps(status_counts, indent=2)}")
    print(f"Types: {json.dumps(type_counts, indent=2)}")
