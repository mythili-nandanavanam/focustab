const STORAGE_KEYS = {
  EVENTS: "browsing_events",
  BACKEND_URL: "backend_url",
  TIME_LIMITS: "time_limits",
  BLOCKED_SITES: "blocked_sites",
  BLOCKING_ENABLED: "blocking_enabled",
  TODAY_USAGE: "today_usage",
  LAST_UPLOAD_AT: "last_upload_at",
  LIVE_SESSION: "live_session",
  NOTIFIED_DOMAINS: "notified_domains"
};

const JUNK = new Set(["newtab","localhost","127.0.0.1","[::]","0.0.0.0","extensions","chrome","about"]);

function isJunk(domain) {
  if (!domain) return true;
  if (JUNK.has(domain)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return true;
  if (domain.startsWith("192.168.") || domain.startsWith("10.")) return true;
  return false;
}

function getDomain(url) {
  try {
    const p = new URL(url);
    if (p.protocol === "chrome:" || p.protocol === "chrome-extension:" || p.protocol === "about:") return null;
    return p.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch { return null; }
}

function nowIso() { return new Date().toISOString(); }
async function get(keys) { return chrome.storage.local.get(keys); }
async function set(obj) { return chrome.storage.local.set(obj); }

// ── Defaults ──────────────────────────────────────────────
async function ensureDefaults() {
  const s = await get(Object.values(STORAGE_KEYS));
  const u = {};
  if (!Array.isArray(s[STORAGE_KEYS.EVENTS])) u[STORAGE_KEYS.EVENTS] = [];
  if (!s[STORAGE_KEYS.BACKEND_URL]) u[STORAGE_KEYS.BACKEND_URL] = "http://localhost:8000";
  if (!s[STORAGE_KEYS.TIME_LIMITS]) u[STORAGE_KEYS.TIME_LIMITS] = {};
  if (!Array.isArray(s[STORAGE_KEYS.BLOCKED_SITES])) u[STORAGE_KEYS.BLOCKED_SITES] = [];
  if (typeof s[STORAGE_KEYS.BLOCKING_ENABLED] !== "boolean") u[STORAGE_KEYS.BLOCKING_ENABLED] = false;
  if (!s[STORAGE_KEYS.TODAY_USAGE]) u[STORAGE_KEYS.TODAY_USAGE] = { date: new Date().toISOString().slice(0,10), usage: {} };
  if (!Array.isArray(s[STORAGE_KEYS.NOTIFIED_DOMAINS])) u[STORAGE_KEYS.NOTIFIED_DOMAINS] = [];
  if (Object.keys(u).length) await set(u);
}

async function resetDaily() {
  const s = await get([STORAGE_KEYS.TODAY_USAGE, STORAGE_KEYS.NOTIFIED_DOMAINS]);
  const today = new Date().toISOString().slice(0,10);
  if (!s[STORAGE_KEYS.TODAY_USAGE] || s[STORAGE_KEYS.TODAY_USAGE].date !== today) {
    await set({
      [STORAGE_KEYS.TODAY_USAGE]: { date: today, usage: {} },
      [STORAGE_KEYS.NOTIFIED_DOMAINS]: []
    });
  }
}

// ── Live session ──────────────────────────────────────────
async function getSession() {
  const s = await get([STORAGE_KEYS.LIVE_SESSION]);
  return s[STORAGE_KEYS.LIVE_SESSION] || null;
}
async function setSession(domain, startTime) {
  await set({ [STORAGE_KEYS.LIVE_SESSION]: { domain, startTime } });
}
async function clearSession() {
  await set({ [STORAGE_KEYS.LIVE_SESSION]: null });
}

// ── Usage ─────────────────────────────────────────────────
async function addUsage(domain, seconds) {
  if (!domain || seconds <= 0 || isJunk(domain)) return;
  const s = await get([STORAGE_KEYS.TODAY_USAGE]);
  const today = new Date().toISOString().slice(0,10);
  let cur = s[STORAGE_KEYS.TODAY_USAGE] || { date: today, usage: {} };
  if (cur.date !== today) cur = { date: today, usage: {} };
  cur.usage[domain] = (cur.usage[domain] || 0) + seconds;
  await set({ [STORAGE_KEYS.TODAY_USAGE]: cur });
}

async function recordEvent(domain, startMs, endMs) {
  if (!domain || !startMs || !endMs || endMs <= startMs || isJunk(domain)) return;
  const secs = Math.max(1, Math.floor((endMs - startMs) / 1000));
  const s = await get([STORAGE_KEYS.EVENTS]);
  const events = Array.isArray(s[STORAGE_KEYS.EVENTS]) ? s[STORAGE_KEYS.EVENTS] : [];
  events.push({ domain, start_time: new Date(startMs).toISOString(), duration_seconds: secs });
  await set({ [STORAGE_KEYS.EVENTS]: events });
  await addUsage(domain, secs);
}

// ── Flush live session ────────────────────────────────────
async function flushSession() {
  const session = await getSession();
  if (!session || !session.domain || !session.startTime) return;
  const now = Date.now();
  const secs = Math.floor((now - session.startTime) / 1000);
  if (secs < 1) return;
  await recordEvent(session.domain, session.startTime, now);
  await setSession(session.domain, now);
}

// ── Show in-page alert ────────────────────────────────────
function showAlert(tabId, domain, mins) {
  chrome.scripting.executeScript({
    target: { tabId: tabId, allFrames: false },
    world: "MAIN",
    func: function(domain, mins) {
      // Remove existing alert if any
      var old = document.getElementById("focustab-limit-alert");
      if (old) old.remove();

      var div = document.createElement("div");
      div.id = "focustab-limit-alert";
      div.style.cssText = [
        "position: fixed",
        "top: 20px",
        "right: 20px",
        "z-index: 2147483647",
        "background: #0d0f12",
        "color: #e8eaf0",
        "border: 1px solid #00e5a0",
        "border-left: 4px solid #00e5a0",
        "border-radius: 10px",
        "padding: 16px 20px",
        "font-family: -apple-system, sans-serif",
        "font-size: 14px",
        "line-height: 1.5",
        "box-shadow: 0 8px 32px rgba(0,0,0,0.6)",
        "max-width: 300px",
        "min-width: 240px"
      ].join(";");

      div.innerHTML =
        "<div style='color:#00e5a0;font-weight:700;font-size:15px;margin-bottom:8px'>⏱ Time Limit Reached</div>" +
        "<div>You've used your <strong>" + mins + " min</strong> daily limit on <strong>" + domain + "</strong>.</div>" +
        "<div style='margin-top:10px;font-size:11px;color:#6b7280'>This message will be closed soon.</div>";

      document.body.appendChild(div);
      setTimeout(function() { if (div && div.parentNode) div.remove(); }, 8000);
    },
    args: [domain, mins]
  }).catch(function(e) {
    console.warn("Could not inject alert into tab:", e.message);
  });
}

// ── Check time limit ──────────────────────────────────────
async function checkLimit() {
  const session = await getSession();
  if (!session || !session.domain) return;

  const s = await get([
    STORAGE_KEYS.TODAY_USAGE,
    STORAGE_KEYS.TIME_LIMITS,
    STORAGE_KEYS.BLOCKING_ENABLED,
    STORAGE_KEYS.NOTIFIED_DOMAINS
  ]);

  const limit = (s[STORAGE_KEYS.TIME_LIMITS] || {})[session.domain];
  if (!limit) return;

  const used = ((s[STORAGE_KEYS.TODAY_USAGE] || {}).usage || {})[session.domain] || 0;
  if (used < limit) return;

  const notified = Array.isArray(s[STORAGE_KEYS.NOTIFIED_DOMAINS]) ? s[STORAGE_KEYS.NOTIFIED_DOMAINS] : [];
  const mins = Math.round(limit / 60);

  // Get active tab first
  const tabs = await new Promise(function(resolve) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, function(t) { resolve(t || []); });
  });
  const activeTab = tabs[0];

  if (!notified.includes(session.domain)) {
    // Mark notified
    notified.push(session.domain);
    await set({ [STORAGE_KEYS.NOTIFIED_DOMAINS]: notified });

    // System notification (backup)
    chrome.notifications.create("limit-" + session.domain + "-" + Date.now(), {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.png"),
      title: "FocusTab — Time Limit Reached",
      message: "You've used your " + mins + " min limit on " + session.domain + "."
    });

    // In-page alert
    if (activeTab && activeTab.id) {
      showAlert(activeTab.id, session.domain, mins);
    }
  }

  // Block and redirect if toggle on
  if (s[STORAGE_KEYS.BLOCKING_ENABLED]) {
    await blockDomain(session.domain);
    if (activeTab && activeTab.id) {
      chrome.tabs.update(activeTab.id, { url: "chrome://newtab" });
    }
  }
}

// ── Blocking ──────────────────────────────────────────────
function ruleId(domain) {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) % 100000;
  return h + 1;
}

async function blockDomain(domain) {
  if (!chrome.declarativeNetRequest) return;
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ruleId(domain)],
      addRules: [{ id: ruleId(domain), priority: 1, action: { type: "block" }, condition: { urlFilter: "||" + domain + "^", resourceTypes: ["main_frame"] } }]
    });
  } catch(e) { console.warn("block failed:", e); }
}

async function applyBlockRules() {
  if (!chrome.declarativeNetRequest) return;
  const s = await get([STORAGE_KEYS.BLOCKED_SITES]);
  const sites = Array.isArray(s[STORAGE_KEYS.BLOCKED_SITES]) ? s[STORAGE_KEYS.BLOCKED_SITES] : [];
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(function(r) { return r.id; });
  if (!sites.length) {
    if (removeIds.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds });
    return;
  }
  const addRules = sites.map(function(d) {
    return { id: ruleId(d), priority: 1, action: { type: "block" }, condition: { urlFilter: "||" + d + "^", resourceTypes: ["main_frame"] } };
  });
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds, addRules: addRules });
}

// ── Session management ────────────────────────────────────
async function startSession(tabId) {
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { await clearSession(); return; }
  const domain = getDomain(tab.url || "");
  if (!domain || isJunk(domain)) { await clearSession(); return; }
  await setSession(domain, Date.now());
}

async function switchTab(tabId) {
  await flushSession();
  await clearSession();
  await startSession(tabId);
}

// ── Upload ────────────────────────────────────────────────
async function upload() {
  const s = await get([STORAGE_KEYS.EVENTS, STORAGE_KEYS.BACKEND_URL]);
  const events = Array.isArray(s[STORAGE_KEYS.EVENTS]) ? s[STORAGE_KEYS.EVENTS] : [];
  if (!events.length) return;
  const url = (s[STORAGE_KEYS.BACKEND_URL] || "http://localhost:8000").replace(/\/$/, "");
  try {
    const res = await fetch(url + "/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: 1, events })
    });
    if (!res.ok) throw new Error(res.status);
    await set({ [STORAGE_KEYS.EVENTS]: [], [STORAGE_KEYS.LAST_UPLOAD_AT]: nowIso() });
  } catch(e) { console.warn("upload failed:", e); }
}

async function syncPrefs() {
  const s = await get([STORAGE_KEYS.BACKEND_URL]);
  const url = (s[STORAGE_KEYS.BACKEND_URL] || "http://localhost:8000").replace(/\/$/, "");
  try {
    const res = await fetch(url + "/preferences?user_id=1");
    if (!res.ok) return;
    const data = await res.json();
    await set({ [STORAGE_KEYS.TIME_LIMITS]: data.time_limits || {}, [STORAGE_KEYS.BLOCKED_SITES]: data.blocked_sites || [] });
  } catch {}
}

function makeAlarms() {
  chrome.alarms.create("tick", { periodInMinutes: 0.5 });
  chrome.alarms.create("upload", { periodInMinutes: 5 });
  chrome.alarms.create("sync", { periodInMinutes: 60 });
}

function initSession() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, function(tabs) {
    if (tabs && tabs[0]) startSession(tabs[0].id);
  });
}

// ── Listeners ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await syncPrefs();
  await applyBlockRules();
  chrome.alarms.clearAll(makeAlarms);
  initSession();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await resetDaily();
  await applyBlockRules();
  chrome.alarms.clearAll(makeAlarms);
  initSession();
});

chrome.tabs.onActivated.addListener(async (info) => {
  await switchTab(info.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (typeof changeInfo.url !== "string") return;
  const tabs = await new Promise(function(resolve) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, function(t) { resolve(t || []); });
  });
  if (tabs[0] && tabs[0].id === tabId) await switchTab(tabId);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushSession();
    await clearSession();
    return;
  }
  chrome.tabs.query({ active: true, windowId: windowId }, async function(tabs) {
    if (tabs && tabs[0]) await startSession(tabs[0].id);
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "tick") {
    await flushSession();
    await checkLimit();
  }
  if (alarm.name === "upload") await upload();
  if (alarm.name === "sync") { await syncPrefs(); await applyBlockRules(); }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (STORAGE_KEYS.BLOCKED_SITES in changes) {
    await applyBlockRules();
  }
});

chrome.runtime.onSuspend.addListener(async () => {
  await flushSession();
  await upload();
});

// Ensure alarms on worker restart
chrome.alarms.get("tick", function(a) { if (!a) makeAlarms(); });

// Start session on worker restart
initSession();