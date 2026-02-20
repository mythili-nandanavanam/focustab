# FOCUSTAB - AI Enhanced Tab Time Tracker

FOCUSTAB is a complete multi-component local system with:
1. A Chrome Extension (Manifest V3) for tab-time tracking, notifications, and optional blocking.
2. A FastAPI backend with PostgreSQL + SQLAlchemy for event storage, categorization, analytics, and AI insights.
3. A static web dashboard for visual analytics and weekly productivity guidance.

## Project Structure

```text
focustab/
  extension/
    manifest.json
    background.js
    popup.html
    popup.js
    styles.css
  backend/
    app/
      __init__.py
      main.py
      database.py
      models.py
      schemas.py
      crud.py
      analytics.py
      llm_service.py
      config.py
    requirements.txt
    .env.example
  dashboard/
    index.html
    script.js
    styles.css
  docs/
    API.md
  .env.example
  README.md
```

## Features

### Extension
- Tracks active-tab session time.
- Detects tab switching and window focus change.
- Extracts domain from URL.
- Stores events locally under `browsing_events`.
- Uploads events every 5 minutes to backend `/track`.
- Retries automatically if backend is unavailable (events remain buffered).
- Shows daily summary in popup.
- Sends notifications when domain time limit is exceeded.
- Supports optional declarativeNetRequest blocking.

### Backend
- FastAPI + PostgreSQL + SQLAlchemy.
- Auto-creates tables at startup (`create_all`).
- Caches domain categories in `domain_categories`.
- LLM provider abstraction (`openai` or `gemini`) for domain categorization and weekly tips.
- Analytics endpoints for daily/weekly reports.
- Preferences APIs and weekly insights persistence.

### Dashboard
- No build tools required.
- Renders:
  - Daily timeline (top active hours)
  - Top domains
  - Category pie chart
  - Focus vs distraction chart
  - Weekly AI insights text

## Environment Variables

Use `backend/.env` (copy from `backend/.env.example`):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/focustab
LLM_PROVIDER=openai
LLM_API_KEY=
OPENAI_MODEL=gpt-4o-mini
GEMINI_MODEL=gemini-1.5-flash
```

Optional root `.env.example` is included for shared values:
- `DATABASE_URL`
- `LLM_PROVIDER`
- `LLM_API_KEY`
- `BACKEND_URL`

## Backend Setup (Windows / Linux / macOS)

1. Create PostgreSQL database:
```sql
CREATE DATABASE focustab;
```

2. Install dependencies:
```bash
cd backend
python -m venv venv
```

3. Activate virtual environment:
- Windows:
```powershell
venv\Scripts\activate
```
- Linux/macOS:
```bash
source venv/bin/activate
```

4. Install packages:
```bash
pip install -r requirements.txt
```

5. Configure environment:
- Copy `backend/.env.example` to `backend/.env`
- Fill `DATABASE_URL` and `LLM_API_KEY`

6. Run backend:
```bash
uvicorn app.main:app --reload
```

7. Verify:
- `http://localhost:8000/health`
- `http://localhost:8000/docs`

## Extension Load

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select `focustab/extension`

## Dashboard Run

Open:
- `focustab/dashboard/index.html`

Set backend URL to `http://localhost:8000`, then click Refresh.

## Test Flow

1. Start backend.
2. Load extension.
3. Open and switch tabs for a few minutes.
4. Open extension popup and verify usage appears.
5. Wait up to 5 minutes for batch upload.
6. Verify backend:
   - `GET /analytics/daily`
   - `GET /analytics/weekly`
   - `GET /insights/weekly`
7. Open dashboard and confirm charts + insights render.

## API Routes

- `POST /track`
- `GET /analytics/daily`
- `GET /analytics/weekly`
- `POST /preferences`
- `GET /preferences`
- `GET /insights/weekly`

Detailed route docs: `docs/API.md`

## Notes

- If no valid LLM key is provided, backend uses deterministic fallback categorization/insight generation so local runs still work.
- Rotate secrets immediately if an API key is exposed.
