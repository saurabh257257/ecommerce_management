import pandas as pd
import requests
import re
import json
import time
import sys

API = "https://68.183.83.209.nip.io"
CSV_PATH = r"C:\Users\Saurabh Singh\Downloads\battery_directory_final.csv"
XLSX_PATH = r"C:\Users\Saurabh Singh\Downloads\Contacts_Upload_Template.xlsx"

def normalize_phone(p):
    if pd.isna(p) or not str(p).strip():
        return None
    s = re.sub(r'[^\d]', '', str(p))
    if len(s) >= 10:
        return s[-10:]
    return None

def classify_type(text):
    t = str(text).lower()
    if any(k in t for k in ['manufactur', 'mfr', 'mfg']):
        return 'Battery Manufacturer'
    if any(k in t for k in ['trader', 'trading', 'import', 'export', 'wholesal']):
        return 'Trader'
    return 'Others'

def extract_state_city(address):
    if pd.isna(address):
        return None, None
    indian_states = [
        'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Delhi',
        'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
        'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
        'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
        'Uttar Pradesh','Uttarakhand','West Bengal','Jammu and Kashmir','Ladakh',
    ]
    state = None
    for s in indian_states:
        if s.lower() in str(address).lower():
            state = s
            break
    parts = [p.strip() for p in str(address).split(',')]
    city = None
    for i, p in enumerate(parts):
        if state and state.lower() in p.lower() and i > 0:
            city = re.sub(r'\d+', '', parts[i-1]).strip()
            if city:
                break
    return state, city

def clean_email(e):
    if pd.isna(e):
        return None
    e = str(e).strip()
    e = re.sub(r'^Email:\s*', '', e, flags=re.IGNORECASE).strip()
    if '@' in e:
        return e
    return None

def parse_csv():
    df = pd.read_csv(CSV_PATH, encoding='utf-8', on_bad_lines='skip')
    contacts = []
    for _, r in df.iterrows():
        phone = normalize_phone(r.get('Mobile'))
        if not phone:
            continue
        notes = str(r.get('Notes', ''))
        ctype = classify_type(notes)
        state, city = extract_state_city(r.get('Address'))
        contacts.append({
            'name': str(r.get('Company Name', '')).strip() if pd.notna(r.get('Company Name')) else '',
            'phone': phone,
            'company': str(r.get('Company Name', '')).strip() if pd.notna(r.get('Company Name')) else '',
            'email': clean_email(r.get('Email')),
            'state': state,
            'city': city,
            'source': 'eBatteryDirectory',
            'remark': notes[:500] if notes else None,
            'customer_type': ctype,
            'status': 'Lead',
            'country': 'India',
        })
    return contacts

def parse_xlsx():
    contacts = []
    sheets = pd.read_excel(XLSX_PATH, sheet_name=None)

    # Sheet 1: Saurabh_UP
    if 'Saurabh_UP' in sheets:
        df = sheets['Saurabh_UP']
        for _, r in df.iterrows():
            phones = str(r.get('phone', ''))
            for p in re.split(r'[,/]', phones):
                phone = normalize_phone(p)
                if not phone:
                    continue
                name = str(r.get('name', '')).strip() if pd.notna(r.get('name')) else ''
                if name.lower() in ('name', 'nan', ''):
                    continue
                contacts.append({
                    'name': name,
                    'phone': phone,
                    'company': str(r.get('company', '')).strip() if pd.notna(r.get('company')) else name,
                    'email': clean_email(r.get('email')),
                    'state': str(r.get('state', '')).strip() if pd.notna(r.get('state')) and str(r.get('state')).lower() != 'state' else None,
                    'city': str(r.get('city', '')).strip() if pd.notna(r.get('city')) and str(r.get('city')).lower() != 'city' else None,
                    'source': str(r.get('source', 'XLSX')).strip() if pd.notna(r.get('source')) and str(r.get('source')).lower() != 'source' else 'XLSX',
                    'remark': str(r.get('remark', '')).strip() if pd.notna(r.get('remark')) and str(r.get('remark')).lower() != 'remark' else None,
                    'customer_type': 'Others',
                    'status': 'Lead',
                    'country': 'India',
                })

    # Sheet 2: Rohan Punjab, Haryana & Rajasth
    for sname in sheets:
        if 'rohan' in sname.lower() and 'filtered' not in sname.lower() and 'phone' not in sname.lower():
            df = sheets[sname]
            for _, r in df.iterrows():
                phone = normalize_phone(r.get('phone'))
                if not phone:
                    continue
                name = str(r.get('name', r.get('Company Name', ''))).strip() if pd.notna(r.get('name', r.get('Company Name'))) else ''
                if name.lower() in ('name', 'company name', 'nan', ''):
                    continue
                company_type = str(r.get('company', r.get('requirement', ''))).strip() if pd.notna(r.get('company', r.get('requirement'))) else ''
                ctype = classify_type(company_type)
                state_val = str(r.get('state', '')).strip() if pd.notna(r.get('state')) and str(r.get('state')).lower() != 'state' else None
                city_val = str(r.get('city', '')).strip() if pd.notna(r.get('city')) and str(r.get('city')).lower() != 'city' else None
                contacts.append({
                    'name': name,
                    'phone': phone,
                    'company': name,
                    'email': None,
                    'state': state_val,
                    'city': city_val,
                    'source': 'XLSX',
                    'remark': str(r.get('requirement', r.get('remark', ''))).strip()[:500] if pd.notna(r.get('requirement', r.get('remark'))) else None,
                    'customer_type': ctype,
                    'status': 'Lead',
                    'country': 'India',
                })

    # Sheet 3: Rohan Filtered
    if 'Rohan Filtered' in sheets:
        df = sheets['Rohan Filtered']
        for _, r in df.iterrows():
            phone = normalize_phone(r.get('phone'))
            if not phone:
                continue
            name = str(r.get('Company Name', '')).strip() if pd.notna(r.get('Company Name')) else ''
            if name.lower() in ('company name', 'nan', ''):
                continue
            company_type = str(r.get('Company Type', '')).strip() if pd.notna(r.get('Company Type')) else ''
            ctype = classify_type(company_type)
            contacts.append({
                'name': name,
                'phone': phone,
                'company': name,
                'email': None,
                'state': str(r.get('state', '')).strip() if pd.notna(r.get('state')) and str(r.get('state')).lower() != 'state' else None,
                'city': str(r.get('city', '')).strip() if pd.notna(r.get('city')) and str(r.get('city')).lower() != 'city' else None,
                'source': 'XLSX-Filtered',
                'remark': str(r.get('other details', '')).strip()[:500] if pd.notna(r.get('other details')) else None,
                'customer_type': ctype,
                'status': 'Lead',
                'country': 'India',
            })

    # Sheet 4: Rohan Phone
    if 'Rohan Phone' in sheets:
        df = sheets['Rohan Phone']
        for _, r in df.iterrows():
            phone = normalize_phone(r.get('Phone 1 - Value'))
            if not phone:
                continue
            name = str(r.get('First Name', '')).strip() if pd.notna(r.get('First Name')) else ''
            if not name:
                continue
            comments = str(r.get('Comments', '')).strip().lower()
            status = 'Lead'
            if 'onboarded' in comments:
                status = 'Onboarded'
            elif 'no response' in comments or 'no reply' in comments:
                status = 'Contacted but No Response'
            contacts.append({
                'name': name,
                'phone': phone,
                'company': str(r.get('Organization Name', '')).strip() if pd.notna(r.get('Organization Name')) else name,
                'email': None,
                'state': None,
                'city': None,
                'source': 'Phone-Contacts',
                'remark': None,
                'customer_type': 'Others',
                'status': status,
                'country': 'India',
            })

    return contacts

def deduplicate(contacts):
    seen = {}
    for c in contacts:
        key = c['phone']
        if key in seen:
            existing = seen[key]
            for field in ('email', 'state', 'city', 'remark', 'company'):
                if not existing.get(field) and c.get(field):
                    existing[field] = c[field]
            if existing.get('status') == 'Lead' and c.get('status') != 'Lead':
                existing['status'] = c['status']
        else:
            seen[key] = c
    return list(seen.values())

def ensure_types_and_statuses():
    types_needed = ['Battery Manufacturer', 'Trader', 'Others']
    statuses_needed = ['Lead', 'Contacted but No Response', 'Onboarded']
    for t in types_needed:
        try:
            requests.post(f"{API}/api/customer-types", json={"name": t, "color": "#6366f1"}, timeout=10)
        except:
            pass
    for s in statuses_needed:
        try:
            requests.post(f"{API}/api/statuses", json={"name": s, "color": "#6366f1"}, timeout=10)
        except:
            pass

def upload_batch(contacts, batch_size=100):
    total = len(contacts)
    uploaded = 0
    errors = 0
    for i in range(0, total, batch_size):
        batch = contacts[i:i+batch_size]
        try:
            r = requests.post(f"{API}/api/crm/import", json=batch, timeout=60)
            if r.status_code == 200:
                data = r.json()
                uploaded += data.get('imported', len(batch))
                print(f"  Batch {i//batch_size + 1}: imported {data.get('imported', '?')}, skipped {data.get('skipped', '?')}")
            else:
                errors += len(batch)
                print(f"  Batch {i//batch_size + 1}: HTTP {r.status_code} — {r.text[:200]}")
        except Exception as e:
            errors += len(batch)
            print(f"  Batch {i//batch_size + 1}: Error — {e}")
        time.sleep(0.5)
    return uploaded, errors

if __name__ == '__main__':
    print("=== Contact Import Script ===\n")

    print("1. Ensuring customer types & statuses exist...")
    ensure_types_and_statuses()

    print("2. Parsing battery_directory_final.csv...")
    csv_contacts = parse_csv()
    print(f"   -> {len(csv_contacts)} contacts from CSV")

    print("3. Parsing Contacts_Upload_Template.xlsx...")
    xlsx_contacts = parse_xlsx()
    print(f"   -> {len(xlsx_contacts)} contacts from XLSX")

    all_contacts = xlsx_contacts + csv_contacts
    print(f"\n4. Total raw: {len(all_contacts)}")

    print("5. Deduplicating by phone...")
    unique = deduplicate(all_contacts)
    print(f"   -> {len(unique)} unique contacts")

    types_count = {}
    status_count = {}
    for c in unique:
        types_count[c['customer_type']] = types_count.get(c['customer_type'], 0) + 1
        status_count[c['status']] = status_count.get(c['status'], 0) + 1
    print(f"\n   Types: {json.dumps(types_count, indent=2)}")
    print(f"   Statuses: {json.dumps(status_count, indent=2)}")

    if '--dry-run' in sys.argv:
        print("\n[DRY RUN] No upload performed.")
        sys.exit(0)

    print(f"\n6. Uploading {len(unique)} contacts in batches of 100...")
    uploaded, errors = upload_batch(unique)
    print(f"\n=== Done: {uploaded} uploaded, {errors} errors ===")
