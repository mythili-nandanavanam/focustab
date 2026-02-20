let chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function fmtSeconds(s) {
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}


function renderBarChart(canvasId, labels, values, label) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        backgroundColor: "#0f766e"
      }]
    },
    options: {
      responsive: true,
      plugins: { tooltip: {
      callbacks: { label: ctx => fmtSeconds(ctx.raw) }
    }, legend: { display: false } }
      }
  });
}

function renderPieChart(canvasId, labels, values) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  chartInstances[canvasId] = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ["#1d4ed8", "#dc2626", "#f59e0b", "#10b981", "#9333ea", "#64748b"]
      }]
    },
    options: { responsive: true }
  });
}

function renderDoughnutChart(canvasId, labels, values) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  chartInstances[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ["#059669", "#e11d48"]
      }]
    }
  });
}

function renderInsights(insights) {
  const list = document.getElementById("insights-list");
  list.innerHTML = "";
  insights.forEach((tip) => {
    const li = document.createElement("li");
    li.textContent = tip;
    list.appendChild(li);
  });
}

async function refreshDashboard() {
  const base = document.getElementById("backend-url").value.trim().replace(/\/$/, "") || "http://localhost:8000";
  const [daily, weekly, insights] = await Promise.all([
    fetchJson(`${base}/analytics/daily?user_id=1`),
    fetchJson(`${base}/analytics/weekly?user_id=1`),
    fetchJson(`${base}/insights/weekly?user_id=1`)
  ]);

  const dailyHours = daily.peak_usage_hours || [];
  renderBarChart(
    "dailyTimelineChart",
    dailyHours.map((x) => `${x.hour}:00`),
    dailyHours.map((x) => fmtSeconds(x.duration_seconds)),
    "Minutes"
  );

  const topDomains = Object.entries(daily.total_time_per_domain || {}).slice(0, 8);
  renderBarChart(
    "topDomainsChart",
    topDomains.map(([domain]) => domain),
    topDomains.map(([, value]) => fmtSeconds(value)),
    "Minutes"
  );

  const categoryData = Object.entries(weekly.total_time_per_category || {});
  renderPieChart(
    "categoryPieChart",
    categoryData.map(([category]) => category),
    categoryData.map(([, value]) => fmtSeconds(value))
  );

  const ratio = weekly.focus_vs_distraction_ratio || { focus: 0, distraction: 0 };
  renderDoughnutChart(
    "focusChart",
    ["Focus", "Distraction"],
    [ratio.focus || 0, ratio.distraction || 0]
  );

  renderInsights(insights.insights || []);
}

document.getElementById("refresh-btn").addEventListener("click", async () => {
  try {
    await refreshDashboard();
  } catch (error) {
    alert(`Failed to refresh dashboard: ${error.message}`);
  }
});

refreshDashboard().catch((error) => {
  alert(`Failed to load dashboard: ${error.message}`);
});
