# LLRE EMIS School System

**Lilongwe Rural East — Education Management Information System**

A full-stack web application for district-level student management, supporting authentication, role-based access, historical data import (CSV), automatic student ID generation, and Excel export.

---

## 🚀 Quick Setup Guide

### Step 1: Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Open the **SQL Editor** in your Supabase dashboard
3. Run the SQL files in order:
   - `sql/01_schema.sql` — Creates all tables, RLS policies, and triggers
   - `sql/02_schools_seed.sql` — Populates all LLRE schools and zones

### Step 2: Create Admin User

In Supabase dashboard → **Authentication → Users → Add User**:
- Email: `admin@llre.emis`
- Password: (choose a strong password)

The trigger in `01_schema.sql` will automatically create the admin profile.

### Step 3: Create School Users

For each school, create a user in Supabase Auth:
- Email: `{EMIS_NUMBER}@llre.emis` (e.g., `500164@llre.emis`)
- Password: (set a default, schools can change later)

The trigger automatically assigns:
- `role = 'school'`
- `emis_number = {EMIS_NUMBER}`

### Step 4: Configure Frontend

Edit `env-config.js` and replace:
```javascript
window.ENV_SUPABASE_URL = 'https://your-project.supabase.co';
window.ENV_SUPABASE_ANON_KEY = 'your-anon-key-here';
```

Find these in: Supabase → Project Settings → API

---

## 🌐 Deployment (Netlify)

### Option A: Drag & Drop
1. Go to [netlify.com](https://netlify.com)
2. Drag the entire `llre-emis` folder to Netlify's drop zone
3. Done! Your site is live.

### Option B: Git Deploy
1. Push this folder to GitHub
2. Connect GitHub repo to Netlify
3. Set build settings:
   - Build command: _(leave empty)_
   - Publish directory: `.`
4. Add Environment Variables in Netlify:
   - `SUPABASE_URL` = your URL
   - `SUPABASE_ANON_KEY` = your key

### Option C: Environment Variables (Recommended for Production)
Update `env-config.js` to read Netlify env vars, or use a build step.

---

## 📥 Importing Historical Data (2019–2026)

### CSV File Format
Your CSV files must have these exact column headers:
```
student_id,emis_number,zone,year,surname,name,sex,age,class
```

### Example Row:
```
2019165001640001,500164,CHIGONTHI,2019,BANDA,CHISOMO,F,8,STD 1
```

### Upload Process:
1. Log in as **admin@llre.emis**
2. Go to **Import CSV** in the sidebar
3. Click the upload zone and select your CSV file(s)
4. The system will import all records with `source = 'imported'`
5. Existing student IDs are preserved (no duplicates)

**Tip:** You can upload multiple CSV files at once.

---

## 🔑 Student ID Format

```
[YEAR][16][EMIS][4-DIGIT-SEQUENCE]
```

Example: `2027165001640001`
- `2027` = Year
- `16` = District code
- `500164` = School EMIS number
- `0001` = Sequence (auto-incremented per school per year)

---

## 👥 User Roles

| Role  | Email Format           | Access |
|-------|------------------------|--------|
| Admin | admin@llre.emis        | Full system access |
| School| {EMIS}@llre.emis       | Own school data only |

---

## 🏫 Zones & Schools

The system includes schools from these zones:
- CHIGONTHI
- CHINYAMA
- DZENZA
- KALOLO
- KHONGONI
- LINTHIPE
- MALINGUNDE
- MITUNDU
- MPONDABWINO

To add more schools, run additional INSERT statements in Supabase SQL Editor or add rows directly to the `schools` table.

---

## 🔒 Security

- Row Level Security (RLS) is enabled on all tables
- School users can ONLY see their own students
- Admin has full access
- Passwords are managed by Supabase Auth (bcrypt hashed)

---

## 📤 Export

Admin can export:
- **Full district export** (filter by zone/year)
- **Per-school export** (select school + optional year)
- Formats: Excel (.xlsx) or CSV

School users can export their own student list.

---

## 🛠️ Tech Stack

- **Frontend:** Pure HTML/CSS/JavaScript (no build step required)
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Export:** SheetJS (xlsx)
- **Hosting:** Netlify (static)
- **Fonts:** Barlow Condensed + Barlow (Google Fonts)

---

## 📞 Support

For technical support, contact your District EMIS Officer or IT Department.
