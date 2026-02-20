import json
from typing import Any

import requests

from app.config import settings


CATEGORIES = ["Work", "Social Media", "Entertainment", "Learning", "Shopping", "Other"]


def _heuristic_category(domain: str) -> str:
    value = domain.lower()
    rules = {
        "Social Media": ["facebook", "instagram", "tiktok", "x.com", "twitter", "reddit", "snapchat", "linkedin"],
        "Entertainment": ["youtube", "netflix", "hulu", "twitch", "spotify", "disneyplus"],
        "Shopping": ["amazon", "ebay", "etsy", "walmart", "aliexpress"],
        "Work": ["github", "gitlab", "notion", "slack", "docs.google", "atlassian", "jira", "claude.ai", "chatgpt", "openai", "stackoverflow", "linear"],
        "Learning": ["coursera", "udemy", "edx", "khanacademy", "wikipedia", "python.org", "docs.", "developer.", "mdn"],}
    for category, keywords in rules.items():
        if any(keyword in value for keyword in keywords):
            return category
    return "Other"


def _sanitize_category(value: str) -> str:
    cleaned = (value or "").strip()
    if cleaned in CATEGORIES:
        return cleaned
    return "Other"


def _call_openai_for_category(domain: str) -> str | None:
    if not settings.llm_api_key:
        return None

    url = "https://api.openai.com/v1/chat/completions"
    prompt = (
        "Classify this domain into one category:\n"
        "Work\nSocial Media\nEntertainment\nLearning\nShopping\nOther\n\n"
        f"Domain: {domain}\n\nReturn only category."
    )
    payload = {
        "model": settings.openai_model,
        "temperature": 0,
        "messages": [{"role": "user", "content": prompt}],
    }
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {settings.llm_api_key}",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload),
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()
    text = data["choices"][0]["message"]["content"]
    return _sanitize_category(text)


def _call_gemini_for_category(domain: str) -> str | None:
    if not settings.llm_api_key:
        return None

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent?key={settings.llm_api_key}"
    )
    prompt = (
        "Classify this domain into one category:\n"
        "Work\nSocial Media\nEntertainment\nLearning\nShopping\nOther\n\n"
        f"Domain: {domain}\n\nReturn only category."
    )
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    response = requests.post(url, json=payload, timeout=20)
    response.raise_for_status()
    data = response.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return _sanitize_category(text)


def categorize_domain(domain: str) -> str:
    try:
        if settings.llm_provider == "openai":
            category = _call_openai_for_category(domain)
            if category:
                return category
        elif settings.llm_provider == "gemini":
            category = _call_gemini_for_category(domain)
            if category:
                return category
    except Exception:
        pass
    return _heuristic_category(domain)


def _call_openai_for_insights(summary_data: dict[str, Any]) -> list[str] | None:
    if not settings.llm_api_key:
        return None
    url = "https://api.openai.com/v1/chat/completions"
    prompt = (
        "You are a productivity coach. Given this weekly browsing summary JSON, "
        "write exactly 3 practical productivity tips as a numbered list.\n"
        f"{json.dumps(summary_data)}"
    )
    payload = {
        "model": settings.openai_model,
        "temperature": 0.3,
        "messages": [{"role": "user", "content": prompt}],
    }
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {settings.llm_api_key}",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload),
        timeout=25,
    )
    response.raise_for_status()
    text = response.json()["choices"][0]["message"]["content"]
    return _parse_tips(text)


def _call_gemini_for_insights(summary_data: dict[str, Any]) -> list[str] | None:
    if not settings.llm_api_key:
        return None
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent?key={settings.llm_api_key}"
    )
    prompt = (
        "You are a productivity coach. Given this weekly browsing summary JSON, "
        "write exactly 3 practical productivity tips as a numbered list.\n"
        f"{json.dumps(summary_data)}"
    )
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    response = requests.post(url, json=payload, timeout=25)
    response.raise_for_status()
    text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    return _parse_tips(text)


def _parse_tips(text: str) -> list[str]:
    tips: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip().lstrip("-").strip()
        if not line:
            continue
        if line[:2].isdigit():
            line = line[2:].strip(". ").strip()
        elif line and line[0].isdigit() and "." in line:
            line = line.split(".", 1)[1].strip()
        tips.append(line)
    deduped = []
    for tip in tips:
        if tip and tip not in deduped:
            deduped.append(tip)
    return deduped[:3]


def generate_productivity_insights(summary_data: dict[str, Any]) -> list[str]:
    try:
        if settings.llm_provider == "openai":
            tips = _call_openai_for_insights(summary_data)
            if tips and len(tips) == 3:
                return tips
        elif settings.llm_provider == "gemini":
            tips = _call_gemini_for_insights(summary_data)
            if tips and len(tips) == 3:
                return tips
    except Exception:
        pass

    # Deterministic fallback for local runs without an API key.
    top_categories = summary_data.get("total_time_per_category", {})
    social_time = float(top_categories.get("Social Media", 0))
    entertainment_time = float(top_categories.get("Entertainment", 0))
    work_time = float(top_categories.get("Work", 0))
    learning_time = float(top_categories.get("Learning", 0))
    return [
        "Schedule two 25-minute focus blocks in your highest-distraction hours.",
        (
            "Reduce social and entertainment tabs by 20% next week and move those minutes to "
            "work or learning tasks."
            if (social_time + entertainment_time) > (work_time + learning_time)
            else "Protect your strongest focus periods by batching communication checks."
        ),
        "Set strict per-domain limits for your top distracting sites and enable blocking after limit.",
    ]

