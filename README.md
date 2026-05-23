# ShopManager — Setup Guide

## How it works

```
Your Website (HTML/JS)
        │
        │  fetch (POST)
        ▼
Google Apps Script  ←─── deployed as a free web app
        │
        │  Sheets API
        ▼
  Your Google Sheet  ←─── Customers + Orders tabs
```

---

## Step 1 — Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name it **ShopManager**
3. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**COPY_THIS_PART**/edit`

---

## Step 2 — Deploy the Apps Script

1. In your Google Sheet, click **Extensions → Apps Script**
2. Delete any existing code in the editor
3. Copy the entire contents of **`google-apps-script.js`** and paste it in
4. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with the Sheet ID you copied above
5. Click **Save** (floppy disk icon)
6. Click **Deploy → New deployment**
7. Click the gear icon ⚙ next to "Select type" → choose **Web app**
8. Fill in:
   - Description: `ShopManager API`
   - Execute as: **Me**
   - Who has access: **Anyone**
9. Click **Deploy**
10. Click **Authorize access** → choose your Google account → Allow
11. Copy the **Web app URL** — it looks like:
    `https://script.google.com/macros/s/XXXX.../exec`

---

## Step 3 — Connect your website

1. Open **`js/config.js`** in this project
2. Replace `YOUR_APPS_SCRIPT_URL_HERE` with the URL you copied:

```js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/XXXX.../exec";
```

---

## Step 4 — Host your website (free options)

### Option A: GitHub Pages (recommended)
```bash
git init
git add .
git commit -m "Initial commit"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/shopmanager.git
git push -u origin main
# Go to repo Settings → Pages → Deploy from branch → main
```

### Option B: Netlify
- Drag and drop the `ecommerce` folder at [netlify.com/drop](https://netlify.com/drop)
- Done — live in 30 seconds

---

## Project structure

```
ecommerce/
├── index.html              ← Dashboard (stats + recent orders)
├── customers.html          ← Customer list, add/edit/delete
├── orders.html             ← Order list, add/edit/delete, filter by status
├── css/
│   └── style.css           ← All styles
├── js/
│   ├── config.js           ← Paste your Apps Script URL here
│   └── sheets.js           ← API client (talks to Apps Script)
├── google-apps-script.js   ← Deploy this in Google Apps Script
└── README.md               ← This file
```

---

## Updating the Apps Script

If you make changes to `google-apps-script.js`, you must redeploy:
- Apps Script → Deploy → **Manage deployments** → Edit (pencil) → set Version to **New version** → Deploy
