import pandas as pd
import requests
import re
import json
import time

API = "https://68.183.83.209.nip.io"
CSV_PATH = r"C:\Users\Saurabh Singh\Downloads\battery_directory_final.csv"
XLSX_PATH = r"C:\Users\Saurabh Singh\Downloads\Contacts_Upload_Template.xlsx"
CONTACTS_PATH = r"C:\Users\Saurabh Singh\Downloads\contacts.csv"

def normalize_phone(p):
    if pd.isna(p) or not str(p).strip():
        return None
    s = re.sub(r'[^\d]', '', str(p).split('.')[0])
    if len(s) >= 10:
        return s[-10:]
    return None

def classify_type(text):
    t = str(text).lower()
    if any(k in t for k in ['manufactur', 'mfr', 'mfg']):
        return 'Battery Manufacturer'
    if any(k in t for k in ['trader', 'trading', 'import', 'export', 'wholesal']):
        return 'Trader'
    if any(k in t for k in ['retail', 'dealer', 'shop', 'store']):
        return 'Retailer'
    return 'Others'

def clean_email(e):
    if pd.isna(e):
        return None
    e = re.sub(r'^Email:\s*', '', str(e).strip(), flags=re.IGNORECASE).strip()
    return e if '@' in e else None

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

def parse_contacts_csv():
    df = pd.read_csv(CONTACTS_PATH, encoding='utf-8', on_bad_lines='skip')
    contacts = []
    for _, r in df.iterrows():
        phone = normalize_phone(r.get('Phone 1 - Value'))
        if not phone:
            continue
        first = str(r.get('First Name', '')).strip() if pd.notna(r.get('First Name')) else ''
        middle = str(r.get('Middle Name', '')).strip() if pd.notna(r.get('Middle Name')) else ''
        last = str(r.get('Last Name', '')).strip() if pd.notna(r.get('Last Name')) else ''
        name = ' '.join(filter(None, [first, middle, last])).strip()
        if not name:
            continue
        org = str(r.get('Organization Name', '')).strip() if pd.notna(r.get('Organization Name')) else ''
        email = clean_email(r.get('E-mail 1 - Value'))
        notes = str(r.get('Notes', '')).strip() if pd.notna(r.get('Notes')) else ''
        contacts.append({
            'name': name,
            'phone': phone,
            'company': org or name,
            'email': email,
            'state': None,
            'city': None,
            'source': 'Google Contacts',
            'remark': notes[:500] if notes else None,
            'customer_type': 'Others',
            'status': 'Lead',
            'country': 'India',
        })
    return contacts

def parse_battery_csv():
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

    if 'Saurabh_UP' in sheets:
        df = sheets['Saurabh_UP']
        for _, r in df.iterrows():
            for p in re.split(r'[,/]', str(r.get('phone', ''))):
                phone = normalize_phone(p)
                if not phone:
                    continue
                name = str(r.get('name', '')).strip() if pd.notna(r.get('name')) else ''
                if name.lower() in ('name', 'nan', ''):
                    continue
                contacts.append({
                    'name': name, 'phone': phone,
                    'company': str(r.get('company', '')).strip() if pd.notna(r.get('company')) else name,
                    'email': clean_email(r.get('email')),
                    'state': str(r.get('state', '')).strip() if pd.notna(r.get('state')) and str(r.get('state')).lower() != 'state' else None,
                    'city': str(r.get('city', '')).strip() if pd.notna(r.get('city')) and str(r.get('city')).lower() != 'city' else None,
                    'source': 'XLSX', 'remark': None, 'customer_type': 'Others', 'status': 'Lead', 'country': 'India',
                })

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
                contacts.append({
                    'name': name, 'phone': phone, 'company': name, 'email': None,
                    'state': str(r.get('state', '')).strip() if pd.notna(r.get('state')) and str(r.get('state')).lower() != 'state' else None,
                    'city': str(r.get('city', '')).strip() if pd.notna(r.get('city')) and str(r.get('city')).lower() != 'city' else None,
                    'source': 'XLSX', 'remark': None, 'customer_type': ctype, 'status': 'Lead', 'country': 'India',
                })

    if 'Rohan Filtered' in sheets:
        df = sheets['Rohan Filtered']
        for _, r in df.iterrows():
            phone = normalize_phone(r.get('phone'))
            if not phone:
                continue
            name = str(r.get('Company Name', '')).strip() if pd.notna(r.get('Company Name')) else ''
            if name.lower() in ('company name', 'nan', ''):
                continue
            ctype = classify_type(str(r.get('Company Type', '')).strip() if pd.notna(r.get('Company Type')) else '')
            contacts.append({
                'name': name, 'phone': phone, 'company': name, 'email': None,
                'state': str(r.get('state', '')).strip() if pd.notna(r.get('state')) and str(r.get('state')).lower() != 'state' else None,
                'city': str(r.get('city', '')).strip() if pd.notna(r.get('city')) and str(r.get('city')).lower() != 'city' else None,
                'source': 'XLSX-Filtered', 'remark': None, 'customer_type': ctype, 'status': 'Lead', 'country': 'India',
            })

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
            status = 'Onboarded' if 'onboarded' in comments else 'Lead'
            contacts.append({
                'name': name, 'phone': phone,
                'company': str(r.get('Organization Name', '')).strip() if pd.notna(r.get('Organization Name')) else name,
                'email': None, 'state': None, 'city': None,
                'source': 'Phone-Contacts', 'remark': None, 'customer_type': 'Others', 'status': status, 'country': 'India',
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
            if existing.get('customer_type') == 'Others' and c.get('customer_type') != 'Others':
                existing['customer_type'] = c['customer_type']
            if existing.get('status') == 'Lead' and c.get('status') != 'Lead':
                existing['status'] = c['status']
        else:
            seen[key] = c
    return list(seen.values())

def upload_batch(contacts, batch_size=100):
    total = len(contacts)
    uploaded = 0
    for i in range(0, total, batch_size):
        batch = contacts[i:i+batch_size]
        try:
            r = requests.post(f"{API}/api/crm/import", json=batch, timeout=60)
            if r.status_code == 200:
                uploaded += len(batch)
        except:
            pass
        if (i // batch_size) % 10 == 0:
            print(f"  Batch {i//batch_size + 1}/{(total+batch_size-1)//batch_size}...")
        time.sleep(0.3)
    return uploaded

if __name__ == '__main__':
    print("=== Restore All Contacts ===\n")

    print("1. Parsing contacts.csv (Google Contacts)...")
    gc = parse_contacts_csv()
    print(f"   -> {len(gc)} contacts")

    print("2. Parsing battery_directory_final.csv...")
    bc = parse_battery_csv()
    print(f"   -> {len(bc)} contacts")

    print("3. Parsing XLSX sheets...")
    xc = parse_xlsx()
    print(f"   -> {len(xc)} contacts")

    all_contacts = gc + xc + bc
    print(f"\n4. Total raw: {len(all_contacts)}")

    print("5. Deduplicating by phone...")
    unique = deduplicate(all_contacts)
    print(f"   -> {len(unique)} unique contacts")

    print(f"\n6. Uploading {len(unique)} contacts (existing will be updated, missing will be added)...")
    uploaded = upload_batch(unique)
    print(f"\n=== Done: {uploaded} processed ===")
