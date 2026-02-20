# FOCUSTAB API Reference

Base URL (local): `http://localhost:8000`

Interactive docs:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Endpoints

### `POST /track`
Stores browsing events.

Accepted payloads:
1. Object form:
```json
{
  "user_id": 1,
  "events": [
    {
      "domain": "youtube.com",
      "start_time": "2026-02-18T10:00:00Z",
      "duration_seconds": 180
    }
  ]
}
```
2. List form (defaults to user `1`):
```json
[
  {
    "domain": "youtube.com",
    "start_time": "2026-02-18T10:00:00Z",
    "duration_seconds": 180
  }
]
```

Response:
```json
{
  "stored_events": 1,
  "categories_applied": 1
}
```

### `GET /analytics/daily?user_id=1&date=YYYY-MM-DD`
Returns daily metrics:
- total time per domain
- total time per category
- average session duration
- focus vs distraction ratio
- peak usage hours
- tab switch frequency

### `GET /analytics/weekly?user_id=1&week_of=YYYY-MM-DD`
Returns weekly metrics with the same schema as daily analytics.

### `POST /preferences`
Creates/updates user preferences.

Request:
```json
{
  "user_id": 1,
  "focus_sites": ["github.com", "docs.python.org"],
  "blocked_sites": ["youtube.com"],
  "time_limits": {
    "youtube.com": 3600
  }
}
```

### `GET /preferences?user_id=1`
Fetches current user preferences.

### `GET /insights/weekly?user_id=1&force_regenerate=false`
Returns 3 practical weekly productivity tips. Generated insights are persisted in DB table `weekly_insights`.

