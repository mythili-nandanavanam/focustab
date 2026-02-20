const K = {
  EVENTS: "browsing_events",
  BACKEND_URL: "backend_url",
  TIME_LIMITS: "time_limits",
  BLOCKED_SITES: "blocked_sites",
  BLOCKING_ENABLED: "blocking_enabled",
  TODAY_USAGE: "today_usage",
  LAST_UPLOAD_AT: "last_upload_at"
};

const JUNK = new Set(["newtab","localhost","127.0.0.1","[::]","0.0.0.0","extensions","chrome","about"]);
function isJunk(d) {
  if (!d) return true;
  if (JUNK.has(d)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) return true;
  return false;
}

function fmt(s) {
  s = Math.round(s);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h > 0) return h+"h "+m+"m";
  if (m > 0) return m+"m "+sec+"s";
  return sec+"s";
}

function showStatus(msg, err) {
  const el = document.getElementById("status-msg");
  el.textContent = msg;
  el.className = "status-msg " + (err ? "err" : "ok");
  if (!err) setTimeout(() => { el.textContent = ""; el.className = "status-msg"; }, 3000);
}

// ── Tabs ──────────────────────────────────────────────────
document.getElementById("tab-today").onclick = function() {
  document.getElementById("tab-today").className = "tab active";
  document.getElementById("tab-settings").className = "tab";
  document.getElementById("panel-today").className = "panel active";
  document.getElementById("panel-settings").className = "panel";
  loadToday();
};

document.getElementById("tab-settings").onclick = function() {
  document.getElementById("tab-settings").className = "tab active";
  document.getElementById("tab-today").className = "tab";
  document.getElementById("panel-settings").className = "panel active";
  document.getElementById("panel-today").className = "panel";
};

// ── Today ─────────────────────────────────────────────────
function loadToday() {
  chrome.storage.local.get([K.TODAY_USAGE, K.EVENTS, K.LAST_UPLOAD_AT], function(s) {
    const usage = (s[K.TODAY_USAGE] && s[K.TODAY_USAGE].usage) ? s[K.TODAY_USAGE].usage : {};
    const entries = Object.entries(usage).filter(function(e) { return !isJunk(e[0]); }).sort(function(a,b) { return b[1]-a[1]; });
    const list = document.getElementById("usage-list");
    const empty = document.getElementById("empty-msg");
    list.innerHTML = "";
    if (!entries.length) {
      empty.style.display = "block";
      document.getElementById("total-time").textContent = "—";
    } else {
      empty.style.display = "none";
      var total = 0;
      entries.forEach(function(e) { total += e[1]; });
      document.getElementById("total-time").textContent = fmt(total);
      entries.forEach(function(e) {
        var li = document.createElement("li");
        li.className = "usage-item";
        li.innerHTML = '<span class="usage-domain">'+e[0]+'</span><span class="usage-time">'+fmt(e[1])+'</span>';
        list.appendChild(li);
      });
    }
    var events = Array.isArray(s[K.EVENTS]) ? s[K.EVENTS] : [];
    document.getElementById("pending-count").textContent = events.length + " pending";
    var lu = s[K.LAST_UPLOAD_AT];
    document.getElementById("last-upload").textContent = lu
      ? "Last sync: " + new Date(lu).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})
      : "Last sync: never";
  });
}

// ── Settings ──────────────────────────────────────────────
function loadSettings() {
  chrome.storage.local.get([K.BACKEND_URL, K.BLOCKED_SITES, K.TIME_LIMITS, K.BLOCKING_ENABLED], function(s) {
    document.getElementById("backend-url").value = s[K.BACKEND_URL] || "http://localhost:8000";
    document.getElementById("blocked-sites").value = (s[K.BLOCKED_SITES] || []).join(", ");
    document.getElementById("blocking-enabled").checked = s[K.BLOCKING_ENABLED] === true;
    renderRows(s[K.TIME_LIMITS] || {});
  });
}

// ── Limit rows ────────────────────────────────────────────
function renderRows(limits) {
  var c = document.getElementById("limits-container");
  c.innerHTML = "";
  var entries = Object.entries(limits);
  if (entries.length === 0) {
    addRow("", "");
  } else {
    entries.forEach(function(e) { addRow(e[0], Math.round(e[1]/60)); });
  }
}

function addRow(domain, mins) {
  var c = document.getElementById("limits-container");
  var row = document.createElement("div");
  row.className = "limit-row";

  var d = document.createElement("input");
  d.type = "text";
  d.className = "ld";
  d.placeholder = "youtube.com";
  d.value = domain || "";

  var m = document.createElement("input");
  m.type = "number";
  m.className = "lm";
  m.placeholder = "60";
  m.min = "1";
  m.value = mins || "";

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "remove-btn";
  btn.innerHTML = "×";
  btn.onclick = function() { c.removeChild(row); };

  row.appendChild(d);
  row.appendChild(m);
  row.appendChild(btn);
  c.appendChild(row);
}

function getRows() {
  var limits = {};
  var rows = document.getElementById("limits-container").childNodes;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row.classList || !row.classList.contains("limit-row")) continue;
    var ld = row.querySelector(".ld");
    var lm = row.querySelector(".lm");
    if (!ld || !lm) continue;
    var domain = ld.value.trim().toLowerCase();
    var mins = parseInt(lm.value.trim(), 10);
    if (domain && mins >= 1) {
      limits[domain] = mins * 60;
    }
  }
  return limits;
}

document.getElementById("add-limit-btn").onclick = function() { addRow("", ""); };

// ── Save ──────────────────────────────────────────────────
document.getElementById("save-btn").onclick = function() {
  var backendUrl = document.getElementById("backend-url").value.trim().replace(/\/$/, "") || "http://localhost:8000";
  var blockedRaw = document.getElementById("blocked-sites").value.trim();
  var blockedSites = blockedRaw ? blockedRaw.split(",").map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean) : [];
  var limits = getRows();
  var blockingEnabled = document.getElementById("blocking-enabled").checked;

  var payload = {};
  payload[K.BACKEND_URL] = backendUrl;
  payload[K.BLOCKED_SITES] = blockedSites;
  payload[K.TIME_LIMITS] = limits;
  payload[K.BLOCKING_ENABLED] = blockingEnabled;

  chrome.storage.local.set(payload, function() {
    if (chrome.runtime.lastError) {
      showStatus("Error: " + chrome.runtime.lastError.message, true);
      return;
    }
    chrome.storage.local.get([K.TIME_LIMITS, K.BLOCKED_SITES], function(check) {
      var lc = Object.keys(check[K.TIME_LIMITS] || {}).length;
      var bc = (check[K.BLOCKED_SITES] || []).length;
      showStatus("✓ Saved — " + lc + " limit(s), " + bc + " blocked", false);
    });
  });
};

// ── Clear ─────────────────────────────────────────────────
document.getElementById("clear-btn").onclick = function() {
  var today = new Date().toISOString().slice(0, 10);
  var payload = {};
  payload[K.TIME_LIMITS] = {};
  payload[K.BLOCKED_SITES] = [];
  payload[K.BLOCKING_ENABLED] = false;
  payload[K.TODAY_USAGE] = { date: today, usage: {} };
  payload[K.EVENTS] = [];
  chrome.storage.local.set(payload, function() {
    document.getElementById("blocked-sites").value = "";
    document.getElementById("blocking-enabled").checked = false;
    renderRows({});
    showStatus("✓ Cleared everything", false);
  });
};

// ── Init ──────────────────────────────────────────────────
loadToday();
loadSettings();