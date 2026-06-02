// ══════════════════════════════════════════════════════
//  Vice Chancellor Dashboard — Firebase JS (ES Module)
//  Firebase Realtime Database → live fetch & render
// ══════════════════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue, update, onChildChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";
import { getAuth, signOut, onAuthStateChanged , EmailAuthProvider} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";

// ===== Firebase Config =====
const firebaseConfig = {
    apiKey: "AIzaSyCiQJk-1hhGyK4rnUvNIKEnDE35IGTflas",
    authDomain: "complaintmanagementsyste-9c5f8.firebaseapp.com",
    databaseURL: "https://complaintmanagementsyste-9c5f8-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "complaintmanagementsyste-9c5f8",
    storageBucket: "complaintmanagementsyste-9c5f8.firebasestorage.app",
    messagingSenderId: "735335276952",
    appId: "1:735335276952:web:255373716aeb233e2c4bed",
    measurementId: "G-TQJVQ7W3FY"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Global Chart instances (Re-render par destroy karne ke liye globally track honge)
let deptBarChartInstance = null;
let categoryPieChartInstance = null;
let trendLineChartInstance = null;

// Chart.js global dark theme settings
function setChartDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = "#64748b";
    Chart.defaults.borderColor = "#1e293b";
    Chart.defaults.font.family = "'JetBrains Mono', monospace";
    Chart.defaults.font.size = 11;
}

/////////////////
///////////////
// ══════════════════════════════════════════════════════
//  ARCHIVE STATE  (single source — no duplicates)
// ══════════════════════════════════════════════════════
let ARCHIVE_DATA   = [];   // all closed/resolved from Firebase
let archFiltered   = [];
let archPage       = 1;
const ARCH_SIZE    = 10;
let archSortKey    = 'filed';
let archSortDir    = -1;
let toastTimer;


// ══════════════════════════════════════════════════════
//  1. SIDEBAR NAVIGATION — one section open at a time
// ══════════════════════════════════════════════════════
function initSidebar() {
  const navItems = document.querySelectorAll(".nav-item[data-section]");
  const sections = document.querySelectorAll(".dashboard-section");

  function activateSection(sectionId) {
    // Remove active from all nav items
    navItems.forEach((n) => n.classList.remove("active"));
    // Hide all sections
    sections.forEach((s) => s.classList.remove("active-section"));

    // Activate clicked nav item
    const clickedNav = document.querySelector(
      `.nav-item[data-section="${sectionId}"]`
    );
    if (clickedNav) clickedNav.classList.add("active");

    // Show matching section
    const targetSection = document.getElementById(`section-${sectionId}`);
    if (targetSection) targetSection.classList.add("active-section");

    // Update breadcrumb
    const breadcrumb = document.querySelector(".breadcrumb span");
    if (breadcrumb) {
      const labels = {
        overview: "Dashboard / Overview",
        analytics: "Dashboard / Analytics & Reports",
        department: "Dashboard / Department Performance",
        archive: "Dashboard / Archive & History",
        settings: "Dashboard / Settings",
      };
      breadcrumb.textContent = labels[sectionId] || "Dashboard";
    }
  }

  navItems.forEach((item) => {
    item.addEventListener("click", function (e) {
      e.preventDefault();
      const section = this.getAttribute("data-section");
      activateSection(section);
    });
  });

  // Default: open overview
  activateSection("overview");
}

// ══════════════════════════════════════════════════════
//  2. FETCH ALL COMPLAINTS & POPULATE DASHBOARD
// ══════════════════════════════════════════════════════
function initDashboard() {
  const complaintsRef = ref(db, "complaints");
  setChartDefaults();

  onValue(complaintsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // Flatten: each top-level key is a studentId, value has complaint objects
    const allComplaints = [];

    Object.entries(data).forEach(([studentId, complaintsObj]) => {
      if (typeof complaintsObj === "object" && complaintsObj !== null) {
        Object.entries(complaintsObj).forEach(([cmpId, cmp]) => {
          allComplaints.push({ ...cmp, _key: cmpId, _studentId: studentId });
        });
      }
    });

    // ── Standard Dashboard Sections ──────────────────
    updateStatCards(allComplaints);
    renderEscalatedTable(allComplaints);
    renderDeptResolution(allComplaints);
    renderRecentActivity(allComplaints);
    renderQuickSummary(allComplaints);
    updateNotifBadge(allComplaints);

    // ── ADVANCED ANALYTICS & CHARTS ENGINE INTEGRATION ──
    // Isko isolated chala rahy hain taake agar kisi chart me issue ho, to main dashboard crash na ho
    try { renderAnalyticsStats(allComplaints); } catch(e) { console.error("Stats Error:", e); }
    try { renderDeptBarChart(allComplaints); } catch(e) { console.error("Bar Chart Error:", e); }
    try { renderCategoryPieChart(allComplaints); } catch(e) { console.error("Pie Chart Error:", e); }
    try { renderTrendLineChart(allComplaints); } catch(e) { console.error("Line Chart Error:", e); }
    try { renderAnalyticsTable(allComplaints); } catch(e) { console.error("Table Error:", e); }
    try { setupDownloadButtons(allComplaints); } catch(e) { console.error("Buttons Error:", e); }
  });
}

// ══════════════════════════════════════════════════════
//  3. STAT CARDS
// ══════════════════════════════════════════════════════
function updateStatCards(complaints) {
  const now = Date.now();
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  const total = complaints.length;
  const resolved = complaints.filter(
    (c) => c.status?.toLowerCase() === "resolved"
  ).length;
  const inProgress = complaints.filter(
    (c) => c.status?.toLowerCase() === "in progress"
  ).length;
  const pendingOver2 = complaints.filter((c) => {
    if (c.status?.toLowerCase() === "resolved") return false;
    const ts = c.timestamp || c.escalatedAt || 0;
    return now - ts > TWO_DAYS_MS;
  }).length;

  setCardValue(".card-total .stat-value", total);
  setCardValue(".card-resolved .stat-value", resolved);
  setCardValue(".card-inprogress .stat-value", inProgress);
  setCardValue(".card-pending .stat-value", pendingOver2);
}

function setCardValue(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value.toLocaleString();
}

// ══════════════════════════════════════════════════════
//  4. ESCALATED TABLE
// ══════════════════════════════════════════════════════
function renderEscalatedTable(complaints) {
  const tbody = document.querySelector(".panel-alert .data-table tbody");
  if (!tbody) return;

  const now = Date.now();
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  const escalated = complaints.filter((c) => {
    return (
      c.escalated === true &&
      (c.priority?.toLowerCase() === "high" ||
        c.priority?.toLowerCase() === "critical" ||
        c.priority?.toLowerCase() === "medium")
    );
  });

  const urgentPending = complaints.filter((c) => {
    if (c.status?.toLowerCase() === "resolved") return false;
    if (c.escalated === true) return false;
    const ts = c.timestamp || 0;
    const daysPending = (now - ts) / (24 * 60 * 60 * 1000);
    return (
      daysPending > 2 &&
      (c.priority?.toLowerCase() === "high" ||
        c.priority?.toLowerCase() === "critical")
    );
  });

  const tableData = [...escalated, ...urgentPending];

  if (tableData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);">No escalated complaints</td></tr>`;
    return;
  }

  tbody.innerHTML = tableData
    .map((c) => {
      const ts = c.escalatedAt || c.timestamp || 0;
      const daysPending = ts
        ? Math.floor((now - ts) / (24 * 60 * 60 * 1000))
        : "—";

      const priorityClass = getPriorityClass(c.priority);
      const priorityLabel = (c.priority || "MEDIUM").toUpperCase();
      const displayId = c.complaintID || c._key || "—";
      const subject = c.title || c.description?.slice(0, 30) || "—";
      const dept = c.category || "—";

      return `
        <tr>
          <td class="id-cell">${displayId}</td>
          <td>${escHtml(subject)}</td>
          <td>${escHtml(dept)}</td>
          <td><span class="badge ${priorityClass}">${priorityLabel}</span></td>
          <td>${daysPending} Days</td>
          <td>
            <button class="btn-action" onclick="handleTakeAction('${displayId}')">Take Action</button>
            <button class="btn-inquiry" onclick="handleInquiry('${displayId}')">Inquiry</button>
          </td>
        </tr>`;
    })
    .join("");
}

function getPriorityClass(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "critical") return "badge-critical";
  if (p === "high") return "badge-high";
  if (p === "low") return "badge-low";
  return "badge-medium";
}

// ══════════════════════════════════════════════════════
//  5. DEPARTMENT RESOLUTION RATES
// ══════════════════════════════════════════════════════
function renderDeptResolution(complaints) {
  const deptList = document.querySelector(".dept-list");
  if (!deptList) return;

  const deptMap = {};
  complaints.forEach((c) => {
    const dept = c.category || "Unknown";
    if (!deptMap[dept]) deptMap[dept] = { total: 0, resolved: 0 };
    deptMap[dept].total++;
    if (c.status?.toLowerCase() === "resolved") deptMap[dept].resolved++;
  });

  if (Object.keys(deptMap).length === 0) {
    deptList.innerHTML = `<p style="color:var(--muted);padding:1rem;">No department data found.</p>`;
    return;
  }

  deptList.innerHTML = Object.entries(deptMap)
    .map(([dept, stats]) => {
      const rate =
        stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;
      let dotClass, barColor, flagClass, flagText;

      if (rate >= 80) {
        dotClass = "dot-green";
        barColor = "#22c55e";
        flagClass = "flag-green";
        flagText = "✔ EXCELLENT: Operating within optimal timeline";
      } else if (rate >= 60) {
        dotClass = "dot-orange";
        barColor = "#f97316";
        flagClass = "flag-orange";
        flagText = "⚠ WARNING: Approaching minimum threshold";
      } else {
        dotClass = "dot-red";
        barColor = "#ef4444";
        flagClass = "flag-red";
        flagText = "★ CRITICAL: Very slow response time. Red Flagged";
      }

      return `
        <div class="dept-row">
          <span class="status-dot ${dotClass}"></span>
          <div class="dept-info">
            <span class="dept-name">${escHtml(dept)}</span>
            <span class="dept-rate">Resolution Rate: ${rate}%</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar" style="width:${rate}%; background:${barColor};"></div>
          </div>
          <span class="dept-flag ${flagClass}">${flagText}</span>
        </div>`;
    })
    .join("");
}

// ══════════════════════════════════════════════════════
//  6. RECENT ACTIVITY
// ══════════════════════════════════════════════════════
function renderRecentActivity(complaints) {
  const activityList = document.querySelector(".activity-list");
  if (!activityList) return;

  const sorted = [...complaints]
    .sort((a, b) => {
      const ta = a.lastUpdate || a.timestamp || 0;
      const tb = b.lastUpdate || b.timestamp || 0;
      return tb - ta;
    })
    .slice(0, 6);

  if (sorted.length === 0) {
    activityList.innerHTML = `<li style="color:var(--muted);padding:0.5rem;">No recent activity.</li>`;
    return;
  }

  activityList.innerHTML = sorted
    .map((c) => {
      const ts = c.lastUpdate || c.timestamp || 0;
      const timeAgo = formatTimeAgo(ts);
      const status = c.status || "Unknown";
      const id = c.complaintID || c._key || "—";
      const dept = c.category || "—";

      let dotClass, actionText;
      const s = status.toLowerCase();
      if (s === "resolved") {
        dotClass = "act-dot dot-green";
        actionText = `${id} Resolved`;
      } else if (c.escalated) {
        dotClass = "act-dot dot-red";
        actionText = `${id} Escalated`;
      } else if (s === "in progress") {
        dotClass = "act-dot dot-orange";
        actionText = `${id} In Progress`;
      } else {
        dotClass = "act-dot dot-teal";
        actionText = `${id} Submitted`;
      }

      return `
        <li class="activity-item">
          <span class="${dotClass}"></span>
          <div>
            <p class="act-title">${escHtml(actionText)}</p>
            <p class="act-meta">${escHtml(dept)} · ${timeAgo}</p>
          </div>
        </li>`;
    })
    .join("");
}

// ══════════════════════════════════════════════════════
//  7. QUICK SUMMARY
// ══════════════════════════════════════════════════════
function renderQuickSummary(complaints) {
  const now = Date.now();
  const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
  const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const resolved = complaints.filter((c) => c.status?.toLowerCase() === "resolved");
  let avgDays = 0;
  if (resolved.length > 0) {
    const totalMs = resolved.reduce((sum, c) => {
      const start = c.timestamp || 0;
      const end = c.lastUpdate || now;
      return sum + (end - start);
    }, 0);
    avgDays = (totalMs / resolved.length / (24 * 60 * 60 * 1000)).toFixed(1);
  }

  const appealsThisMonth = complaints.filter((c) => {
    return c.escalated === true && (c.escalatedAt || 0) > oneMonthAgo;
  }).length;

  const departments = new Set(complaints.map((c) => c.category).filter(Boolean));
  const deptCount = departments.size;

  const deptMap = {};
  complaints.forEach((c) => {
    const dept = c.category || "Unknown";
    if (!deptMap[dept]) deptMap[dept] = { total: 0, resolved: 0 };
    deptMap[dept].total++;
    if (c.status?.toLowerCase() === "resolved") deptMap[dept].resolved++;
  });
  const criticalFlags = Object.values(deptMap).filter(
    (d) => d.total > 0 && (d.resolved / d.total) * 100 < 60
  ).length;

  const satisfactionRate = complaints.length > 0 ? Math.round((resolved.length / complaints.length) * 100) : 0;

  const openOver5 = complaints.filter((c) => {
    if (c.status?.toLowerCase() === "resolved") return false;
    const ts = c.timestamp || 0;
    return now - ts > FIVE_DAYS_MS;
  }).length;

  const set = (sel, val) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = val;
  };

  set(".sum-avg-resolution", `${avgDays} Days`);
  set(".sum-appeals-month", appealsThisMonth);
  set(".sum-depts-monitored", deptCount);
  set(".sum-critical-flags", criticalFlags);
  set(".sum-satisfaction", `${satisfactionRate}%`);
  set(".sum-open-5days", openOver5);
}

// ══════════════════════════════════════════════════════
//  8. NOTIFICATION BADGE — count unresolved escalated
// ══════════════════════════════════════════════════════
function updateNotifBadge(complaints) {
  const badge = document.querySelector(".notif-badge");
  if (!badge) return;
  const count = complaints.filter(
    (c) => c.escalated === true && c.status?.toLowerCase() !== "resolved"
  ).length;
  badge.textContent = count;
  badge.style.display = count > 0 ? "inline-block" : "none";
}

// ══════════════════════════════════════════════════════
//  9. ANALYTICS CARD VIEW MODULES (THE REPLACEMENT PARTS)
// ══════════════════════════════════════════════════════
function renderAnalyticsStats(all) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    const resolved   = all.filter(c => c.status?.toLowerCase() === "resolved").length;
    const inProgress = all.filter(c => c.status?.toLowerCase() === "in progress").length;
    const escalated  = all.filter(c => c.escalated === true).length;

    set("a-total", all.length);
    set("a-resolved", resolved);
    set("a-inprogress", inProgress);
    set("a-escalated", escalated);
}

function renderDeptBarChart(all) {
    if (typeof Chart === "undefined") return;
    const canvas = document.getElementById("deptBarChart");
    if (!canvas) return;

    const deptMap = {};
    all.forEach(c => {
        const d = c.category || "Unknown";
        if (!deptMap[d]) deptMap[d] = { total: 0, resolved: 0, inProgress: 0, escalated: 0 };
        deptMap[d].total++;
        const s = c.status?.toLowerCase();
        if (s === "resolved") deptMap[d].resolved++;
        else if (s === "in progress") deptMap[d].inProgress++;
        if (c.escalated === true) deptMap[d].escalated++;
    });

    const labels = Object.keys(deptMap);
    const totals     = labels.map(l => deptMap[l].total);
    const resolved   = labels.map(l => deptMap[l].resolved);
    const inProgress = labels.map(l => deptMap[l].inProgress);
    const escalated  = labels.map(l => deptMap[l].escalated);

    if (deptBarChartInstance) deptBarChartInstance.destroy();

    deptBarChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [
                { label: "Total", data: totals, backgroundColor: "rgba(13,148,136,0.7)", borderColor: "#0d9488", borderWidth: 1, borderRadius: 4 },
                { label: "Resolved", data: resolved, backgroundColor: "rgba(34,197,94,0.7)", borderColor: "#22c55e", borderWidth: 1, borderRadius: 4 },
                { label: "In Progress", data: inProgress, backgroundColor: "rgba(249,115,22,0.7)", borderColor: "#f97316", borderWidth: 1, borderRadius: 4 },
                { label: "Escalated", data: escalated, backgroundColor: "rgba(239,68,68,0.7)", borderColor: "#ef4444", borderWidth: 1, borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { maxRotation: 30 }, grid: { color: "#1e293b" } },
                y: { ticks: { stepSize: 1 }, grid: { color: "#1e293b" }, beginAtZero: true }
            }
        }
    });

    const legendEl = document.getElementById("barLegend");
    if (legendEl) {
        const items = [
            { label: "Total", color: "#0d9488" },
            { label: "Resolved", color: "#22c55e" },
            { label: "In Progress", color: "#f97316" },
            { label: "Escalated", color: "#ef4444" }
        ];
        legendEl.innerHTML = items.map(i => `
            <div class="legend-item"><span class="legend-dot" style="background:${i.color}"></span>${i.label}</div>`).join("");
    }
}

function renderCategoryPieChart(all) {
    if (typeof Chart === "undefined") return;
    const canvas = document.getElementById("categoryPieChart");
    if (!canvas) return;

    const catMap = {};
    all.forEach(c => {
        const cat = c.category || "Other";
        catMap[cat] = (catMap[cat] || 0) + 1;
    });

    const labels = Object.keys(catMap);
    const values = labels.map(l => catMap[l]);
    const palette = ["#0d9488", "#22c55e", "#f97316", "#ef4444", "#3b82f6", "#a855f7"];
    const bgColors = labels.map((_, i) => palette[i % palette.length] + "cc");

    if (categoryPieChartInstance) categoryPieChartInstance.destroy();

    categoryPieChartInstance = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: bgColors, borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: "60%", plugins: { legend: { display: false } } }
    });

    const legendEl = document.getElementById("pieLegend");
    if (legendEl) {
        legendEl.innerHTML = labels.map((l, i) => `
            <div class="legend-item"><span class="legend-dot" style="background:${palette[i % palette.length]}"></span>${l} (${catMap[l]})</div>`).join("");
    }
}

function renderTrendLineChart(all) {
    if (typeof Chart === "undefined") return;
    const canvas = document.getElementById("trendLineChart");
    if (!canvas) return;

    const now = new Date();
    const months = [];
    const monthMap = {};

    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.push({ key, label: d.toLocaleString("default", { month: "short", year: "2-digit" }) });
        monthMap[key] = { total: 0, resolved: 0 };
    }

    all.forEach(c => {
        if (!c.timestamp) return;
        const d = new Date(c.timestamp);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (monthMap[key]) {
            monthMap[key].total++;
            if (c.status?.toLowerCase() === "resolved") monthMap[key].resolved++;
        }
    });

    if (trendLineChartInstance) trendLineChartInstance.destroy();

    trendLineChartInstance = new Chart(canvas, {
        type: "line",
        data: {
            labels: months.map(m => m.label),
            datasets: [
                { label: "Total", data: months.map(m => monthMap[m.key].total), borderColor: "#0d9488", tension: 0.4, fill: true },
                { label: "Resolved", data: months.map(m => monthMap[m.key].resolved), borderColor: "#22c55e", tension: 0.4, fill: true }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}

function renderAnalyticsTable(all) {
    const tbody = document.getElementById("analyticsTableBody");
    if (!tbody) return;

    const deptMap = {};
    all.forEach(c => {
        const d = c.category || "Unknown";
        if (!deptMap[d]) deptMap[d] = { total: 0, resolved: 0, inProgress: 0, escalated: 0 };
        deptMap[d].total++;
        const s = c.status?.toLowerCase();
        if (s === "resolved") deptMap[d].resolved++;
        else if (s === "in progress") deptMap[d].inProgress++;
        if (c.escalated === true) deptMap[d].escalated++;
    });

    if (Object.keys(deptMap).length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;">No data available</td></tr>`;
        return;
    }

    tbody.innerHTML = Object.entries(deptMap).map(([dept, stats]) => {
        const rate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;
        let barColor = rate >= 80 ? "#22c55e" : rate >= 60 ? "#f97316" : "#ef4444";
        let badge = rate >= 80 ? `<span class="badge" style="color:#22c55e;">GOOD</span>` : rate >= 60 ? `<span class="badge" style="color:#f97316;">WARNING</span>` : `<span class="badge" style="color:#ef4444;">CRITICAL</span>`;

        return `
        <tr>
            <td><strong>${escHtml(dept)}</strong></td>
            <td>${stats.total}</td>
            <td>${stats.resolved}</td>
            <td>${stats.inProgress}</td>
            <td>${stats.escalated}</td>
            <td>
                <div class="rate-bar-wrap">
                    <div class="rate-bar-bg"><div class="rate-bar-fill" style="width:${rate}%;background:${barColor};"></div></div>
                    <span class="rate-text">${rate}%</span>
                </div>
            </td>
            <td>${badge}</td>
        </tr>`;
    }).join("");
}

function setupDownloadButtons(all) {
    const pdfBtn = document.getElementById("downloadPDF");
    if (pdfBtn) {
        const newPdfBtn = pdfBtn.cloneNode(true);
        pdfBtn.parentNode.replaceChild(newPdfBtn, pdfBtn);
        newPdfBtn.addEventListener("click", () => {
            if (typeof window.jspdf === "undefined") return alert("jsPDF library missing.");
            const doc = new window.jspdf.jsPDF();
            doc.text("Vice Chancellor – Complaint Analytics Report", 14, 18);
            doc.text(`Total Complaints: ${all.length}`, 14, 30);
            doc.save("VC_Analytics_Report.pdf");
        });
    }
    const excelBtn = document.getElementById("downloadExcel");
    if (excelBtn) {
        const newExcelBtn = excelBtn.cloneNode(true);
        excelBtn.parentNode.replaceChild(newExcelBtn, excelBtn);
        newExcelBtn.addEventListener("click", () => {
            if (typeof XLSX === "undefined") return alert("SheetJS missing.");
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(all.map(c => ({ ID: c.complaintID, Subject: c.title, Status: c.status })));
            XLSX.utils.book_append_sheet(wb, ws, "Data");
            XLSX.writeFile(wb, "VC_Analytics.xlsx");
        });
    }
}

// ══════════════════════════════════════════════════════
//  10. ACTION HANDLERS & MODALS
// ══════════════════════════════════════════════════════
window.handleTakeAction = function (complaintId) {
  alert(`Taking action on complaint: ${complaintId}`);
};

window.handleInquiry = function (complaintId) {
  alert(`Opening inquiry for complaint: ${complaintId}`);
};

function initLogout() {
  const logoutBtn = document.querySelector(".nav-logout");
  const modal = document.getElementById("logoutModal");
  const confirmBtn = document.getElementById("confirmLogout");
  const cancelBtn = document.getElementById("cancelLogout");

  if (!logoutBtn || !modal) return;
  logoutBtn.addEventListener("click", (e) => { e.preventDefault(); modal.style.display = "flex"; });
  cancelBtn?.addEventListener("click", () => { modal.style.display = "none"; });
  confirmBtn?.addEventListener("click", () => {
    signOut(auth).then(() => { window.location.href = "login.html"; }).catch(() => { window.location.href = "login.html"; });
  });
}

function initScrollTop() {
  const scrollBtn = document.getElementById("scrollTopBtn");
  if (!scrollBtn) return;
  window.addEventListener("scroll", () => { scrollBtn.classList.toggle("visible", window.scrollY > 200); });
  scrollBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════
function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return "—";
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

// ══════════════════════════════════════════════════════
//  BOOTSTRAP / RUN SYSTEM
// ══════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  initSidebar();
  initScrollTop();
  initLogout();

  onAuthStateChanged(auth, (user) => {
    initDashboard(); // Chalayega system ko smoothly har state me
  });
});


// ══════════════════════════════════════════════════════
//  SETTINGS PORTAL LOGIC
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  1. LOAD DATA ON PAGE LOAD & REALTIME SYNC
// ══════════════════════════════════════════════════════
function loadVCData() {
    // Database reference path
    const settingsRef = ref(db, 'system_settings/vc_profile');
    
    // onValue lagane se jab bhi DB update hoga, UI refresh kiye bina khud badal jayegi
    onValue(settingsRef, (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            // A. Textboxes ki values update karna
            if (document.getElementById("vc-name")) {
                document.getElementById("vc-name").value = data.fullName || "";
            }
            if (document.getElementById("vc-email")) {
                document.getElementById("vc-email").value = data.email || "";
            }

            // B. Profile Card Name Update (Jo image ke sath .profile-info-text h3 hai)
            const cardName = document.querySelector(".profile-info-text h3");
            if (cardName) {
                cardName.textContent = data.fullName;
            }

            // C. Top Right Header Name Update (Jo .user-chip span hai)
            const headerName = document.querySelector(".user-chip span");
            if (headerName) {
                headerName.textContent = data.fullName;
            }
        }
    });
}

// ══════════════════════════════════════════════════════
//  2. SAVE PROFILE TO FIREBASE
// ══════════════════════════════════════════════════════
window.saveVCProfile = function() {
    const nameInput = document.getElementById("vc-name").value.trim();
    const emailInput = document.getElementById("vc-email").value.trim();

    if (!nameInput || !emailInput) {
        alert("Please fill all fields!");
        return;
    }

    const settingsRef = ref(db, 'system_settings/vc_profile');

    // Firebase database mein update push karna
    update(settingsRef, {
        fullName: nameInput,
        email: emailInput,
        lastUpdated: new Date().toISOString()
    })
    .then(() => {
        alert("Success! VC Profile Updated.");
        // Note: Header aur Card Name khud hi bina page refresh kiye update ho jayenge 
        // kyunki upar loadVCData() mein onValue listener active hai.
    })
    .catch((error) => {
        console.error("Firebase Error:", error);
        alert("Failed to update profile. " + error.message);
    });
};


window.saveVCProfile = function() {
    const nameInput = document.getElementById("vc-name").value.trim();
    const emailInput = document.getElementById("vc-email").value.trim();

    if (!nameInput || !emailInput) {
        Swal.fire({ icon: 'warning', title: 'Fields Khali Hain!', text: 'Naam aur Email lazmi likhein.' });
        return;
    }

    const settingsRef = ref(db, 'system_settings/vc_profile');

    update(settingsRef, {
        fullName: nameInput,
        email: emailInput,
        lastUpdated: new Date().toISOString()
    })
    .then(() => {
        // Piyara Success Popup
        Swal.fire({
            icon: 'success',
            title: 'Profile Saved!',
            text: 'Your profile has been updated',
            timer: 2000,
            showConfirmButton: false,
            iconColor: '#008080'
        });
    })
    .catch((error) => {
        Swal.fire({ icon: 'error', title: 'Error!', text: error.message });
    });
};


// ══════════════════════════════════════════════════════
//  3. UPDATE PASSWORD (Firebase Auth Secure Way)
// ══════════════════════════════════════════════════════

 // Ensure these imports are at the top of your file
// import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-auth.js";


window.updateVCPassword = async function() {
    // 1. Get values using your specific IDs
    const currentPass = document.getElementById("current-password").value;
    const newPass = document.getElementById("new-password").value;
    const user = auth.currentUser;

    // 2. Validation: Empty Fields
    if (!currentPass || !newPass) {
        Swal.fire({
            icon: 'warning',
            title: 'Empty Fields',
            text: 'Please enter both your current and new passwords.',
            confirmButtonColor: '#008080'
        });
        return;
    }

    // 3. Validation: Check if New Password is same as Current
    if (currentPass === newPass) {
        Swal.fire({
            icon: 'info',
            title: 'No Change Detected',
            text: 'The new password cannot be the same as your current password.',
            confirmButtonColor: '#008080'
        });
        return;
    }

    // 4. Validation: Minimum Length (Firebase Rule)
    if (newPass.length < 6) {
        Swal.fire({
            icon: 'warning',
            title: 'Weak Password',
            text: 'Your new password must be at least 6 characters long.',
            confirmButtonColor: '#008080'
        });
        return;
    }

    // --- Start Processing Popup ---
    Swal.fire({
        title: 'Updating Password...',
        text: 'Verifying your current credentials, please wait.',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        if (!user) throw new Error("No active user session found. Please log in again.");

        // 5. STEP 1: Verify Current Password (Re-authentication)
        const credential = EmailAuthProvider.credential(user.email, currentPass);
        await reauthenticateWithCredential(user, credential);

        // 6. STEP 2: Update Password in Firebase Auth
        await updatePassword(user, newPass);

        // --- Success Popup ---
        Swal.fire({
            icon: 'success',
            title: 'Success!',
            text: 'Your password has been updated successfully in the system.',
            timer: 2500,
            showConfirmButton: false,
            iconColor: '#008080'
        });

        // Clear input fields
        document.getElementById("current-password").value = "";
        document.getElementById("new-password").value = "";

    } catch (error) {
        // Stop loading spinner immediately on error
        Swal.close(); 
        console.error("Auth Error:", error);

        let title = "Update Failed";
        let errorMessage = "An error occurred while updating your password.";
        
        // Handling Specific English Errors
        if (error.code === 'auth/wrong-password') {
            title = "Incorrect Password";
            errorMessage = "The current password you entered is incorrect. Please check and try again.";
        } else if (error.code === 'auth/requires-recent-login') {
            title = "Session Expired";
            errorMessage = "For security, please log out and log back in to change your password.";
        } else if (error.message) {
            errorMessage = error.message;
        }

        Swal.fire({
            icon: 'error',
            title: title,
            text: errorMessage,
            confirmButtonColor: '#d33'
        });
    }
};

// ══════════════════════════════════════════════════════
//  4. TAB SWITCHING LOGIC (As it is)
// ══════════════════════════════════════════════════════
window.openSettingsTab = function(evt, tabId) {
    const contents = document.querySelectorAll(".tab-content");
    contents.forEach(tab => {
        tab.classList.remove("active");
        tab.style.display = "none";
    });

    const buttons = document.querySelectorAll(".s-nav-btn");
    buttons.forEach(btn => btn.classList.remove("active"));

    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add("active");
        targetTab.style.display = "block";
    }
    evt.currentTarget.classList.add("active");
};

// ══════════════════════════════════════════════════════
//  5. INITIALIZE
// ══════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    loadVCData();
});



// ══════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════
//  ESCALATED COMPLAINTS SECTION (VC DASHBOARD)
//  Auto-receive from HOD when complaint pending > 1 minute
//  Complaint ID = Firebase saved ID (CMP-XXXX-XXXX)
// ════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════

// ─── Global State ─────────────────────────────────────
let ESC_ALL_DATA      = [];     // All raw escalated complaints
let ESC_FILTERED_DATA = [];     // After search/filter applied
let ESC_CURRENT_ITEM  = null;   // Currently opened in modal
let escAutoRefresh    = null;   // Timer for live update
let escListenerActive = false;  // Prevent duplicate listeners

// Import 'get' from firebase (agar already top me imported nahi)
// Already imported: ref, push, set, onValue, update — get bhi chahiye
// Agar 'get' import nahi hai, top wali import line me add karna padega
// Hum yahan get use nahi karenge — onValue se hi kaam chala lenge ✅

// ══════════════════════════════════════════════════════
//  MAIN LOADER — Firebase se data fetch
// ══════════════════════════════════════════════════════
function loadEscalatedComplaintsVC() {
    const tbody = document.getElementById("escTableBody");
    if (!tbody) return;

    if (escListenerActive) {
        // Already listening — just re-render with existing data
        filterEscTable();
        return;
    }
    escListenerActive = true;

    const complaintsRef = ref(db, "complaints");

    onValue(complaintsRef, (snapshot) => {
        ESC_ALL_DATA = [];

        if (!snapshot.exists()) {
            renderEscTable([]);
            return;
        }

        snapshot.forEach((studentSnap) => {
            const studentId = studentSnap.key;

            studentSnap.forEach((complaintSnap) => {
                const c = complaintSnap.val();
                const cId = complaintSnap.key;

                // ✅ Status check — skip resolved
                const status = (c.status || "").toLowerCase();
                if (status === "resolved") return;

                // ✅ MAIN CONDITION: HOD ne escalate ki ho VC ko
                if (c.escalatedToVC !== true) return;

                // ✅ Time reference — jab HOD ne VC ko escalate kiya
                const referenceTime = c.vcEscalatedAt || c.escalatedAt || c.timestamp || 0;
                if (!referenceTime) return;

                // ✅ Push to data array
                ESC_ALL_DATA.push({
                    _key: cId,
                    _studentId: studentId,
                    complaintId: c.complaintId || cId,   // ✅ Firebase saved ID (CMP-XXXX)
                    subject: c.title || c.subject || (c.description ? c.description.slice(0, 50) : "—"),
                    department: c.department || c.category || "Unknown",
                    submittedBy: c.escalatedFromName || c.studentName || c.submittedByName || "Unknown",
                    filedDate: c.timestamp || 0,
                    pendingSince: referenceTime,
                    priority: c.priority || "Medium",
                    status: c.status || "Escalated",
                    raw: c
                });
            });
        });

        // Sort by most urgent first (oldest pending)
        ESC_ALL_DATA.sort((a, b) => a.pendingSince - b.pendingSince);

        // Populate department dropdown dynamically
        populateEscDeptFilter();

        // Apply current filters & render
        filterEscTable();
    });

    // Auto refresh every 30 seconds (pending time update karne ke liye)
    if (escAutoRefresh) clearInterval(escAutoRefresh);
    escAutoRefresh = setInterval(() => {
        if (ESC_FILTERED_DATA.length > 0) renderEscTable(ESC_FILTERED_DATA);
    }, 30000);
}

// ══════════════════════════════════════════════════════
//  POPULATE DEPARTMENT DROPDOWN (Dynamic from data)
// ══════════════════════════════════════════════════════
function populateEscDeptFilter() {
    const select = document.getElementById("escDeptFilter");
    if (!select) return;

    const currentVal = select.value;
    const depts = [...new Set(ESC_ALL_DATA.map(c => c.department).filter(Boolean))];

    // Static depts (from HTML) + dynamic ones
    const allDepts = [...new Set([
        "Computer Science", "Agriculture", "Business Administration", "Zoology", "Biochemistry",
        ...depts
    ])];

    select.innerHTML = `<option value="">All Departments</option>` +
        allDepts.map(d => `<option value="${escHtmlEsc(d)}">${escHtmlEsc(d)}</option>`).join("");

    if (currentVal) select.value = currentVal;
}

// ══════════════════════════════════════════════════════
//  RENDER TABLE
// ══════════════════════════════════════════════════════
function renderEscTable(data) {
    const tbody    = document.getElementById("escTableBody");
    const noRes    = document.getElementById("escNoResults");
    const countEl  = document.getElementById("escRowCount");
    const badgeEl  = document.getElementById("esc-active-count");

    if (!tbody) return;

    // Update counts
    if (countEl) countEl.textContent = data.length;
    if (badgeEl) badgeEl.textContent = `${data.length} Active`;

    // Empty state
    if (data.length === 0) {
        tbody.innerHTML = "";
        if (noRes) noRes.style.display = "block";
        return;
    }
    if (noRes) noRes.style.display = "none";

    const now = Date.now();

    tbody.innerHTML = data.map(c => {
        const pendingTime = formatEscPendingTime(now - c.pendingSince);
        const filedDate = c.filedDate
            ? new Date(c.filedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            : "—";
        const priorityClass = getEscPriorityClass(c.priority);
        const priorityLabel = (c.priority || "MEDIUM").toUpperCase();

        return `
        <tr>
            <td><strong style="color:#0d9488;letter-spacing:0.5px;">${escHtmlEsc(c.complaintId)}</strong></td>
            <td>${escHtmlEsc(c.subject)}</td>
            <td>${escHtmlEsc(c.department)}</td>
            <td><i class="fa-solid fa-user-tie" style="color:#0d9488;margin-right:5px;"></i>${escHtmlEsc(c.submittedBy)}</td>
            <td>${filedDate}</td>
            <td style="color:#ef4444;font-weight:700;">${pendingTime}</td>
            <td><span class="badge ${priorityClass}">${priorityLabel}</span></td>
            <td><span class="badge badge-critical">ESCALATED</span></td>
            <td>
                <button class="btn-action" onclick="openEscModal('${c._studentId}','${c._key}')">
                    <i class="fa-solid fa-eye"></i> Review
                </button>
            </td>
        </tr>`;
    }).join("");
}

// ══════════════════════════════════════════════════════
//  FORMAT PENDING TIME
// ══════════════════════════════════════════════════════
function formatEscPendingTime(ms) {
    if (ms < 0) ms = 0;
    const mins  = Math.floor(ms / 60000);
    const hours = Math.floor(ms / 3600000);
    const days  = Math.floor(ms / 86400000);

    if (days > 0)  return `${days} Day${days > 1 ? "s" : ""}`;
    if (hours > 0) return `${hours} Hour${hours > 1 ? "s" : ""}`;
    if (mins > 0)  return `${mins} Min${mins !== 1 ? "s" : ""}`;
    return `Just now`;
}

// ══════════════════════════════════════════════════════
//  PRIORITY CLASS HELPER
// ══════════════════════════════════════════════════════
function getEscPriorityClass(priority) {
    const p = (priority || "").toLowerCase();
    if (p === "critical") return "badge-critical";
    if (p === "high") return "badge-high";
    if (p === "low") return "badge-low";
    return "badge-medium";
}

// ══════════════════════════════════════════════════════
//  HTML ESCAPE HELPER (local to avoid conflict)
// ══════════════════════════════════════════════════════
function escHtmlEsc(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ══════════════════════════════════════════════════════
//  FILTER / SEARCH
// ══════════════════════════════════════════════════════
// window.filterEscTable = function () {
//     const search  = (document.getElementById("escSearchInput")?.value || "").toLowerCase().trim();
//     const deptVal = document.getElementById("escDeptFilter")?.value || "";
//     const priVal  = (document.getElementById("escPrioFilter")?.value || "").toLowerCase();

//     ESC_FILTERED_DATA = ESC_ALL_DATA.filter(c => {
//         const matchSearch = !search ||
//             c.complaintId.toLowerCase().includes(search) ||
//             c.subject.toLowerCase().includes(search) ||
//             c.department.toLowerCase().includes(search) ||
//             c.submittedBy.toLowerCase().includes(search);

//         const matchDept = !deptVal || c.department === deptVal;
//         const matchPri  = !priVal  || c.priority.toLowerCase() === priVal;

//         return matchSearch && matchDept && matchPri;
//     });

//     renderEscTable(ESC_FILTERED_DATA);
// };

window.filterEscTable = function () {
    const search  = (document.getElementById("escSearchInput")?.value || "").toLowerCase().trim();
    const deptVal = document.getElementById("escDeptFilter")?.value || "";
    const priVal  = (document.getElementById("escPrioFilter")?.value || "").toLowerCase();

    ESC_FILTERED_DATA = ESC_ALL_DATA.filter(c => {
        // String convertion taake error na aaye
        const dept = (c.department || "").toString();
        const prio = (c.priority || "").toLowerCase();
        
        const matchSearch = !search ||
            (c.complaintId || "").toLowerCase().includes(search) ||
            (c.subject || "").toLowerCase().includes(search) ||
            dept.toLowerCase().includes(search) ||
            (c.submittedBy || "").toLowerCase().includes(search);

        // Exact match for Dept dropdown
        const matchDept = !deptVal || dept === deptVal;

        // Exact match for Priority dropdown
        const matchPri = !priVal || prio === priVal;

        return matchSearch && matchDept && matchPri;
    });

    renderEscTable(ESC_FILTERED_DATA);
};


// ══════════════════════════════════════════════════════
//  RESET FILTERS
// ══════════════════════════════════════════════════════
window.resetEscFilters = function () {
    const s = document.getElementById("escSearchInput");
    const d = document.getElementById("escDeptFilter");
    const p = document.getElementById("escPrioFilter");
    if (s) s.value = "";
    if (d) d.value = "";
    if (p) p.value = "";
    filterEscTable();
};

// ══════════════════════════════════════════════════════
//  OPEN MODAL — Complaint Review
// ══════════════════════════════════════════════════════
window.openEscModal = function (studentId, complaintKey) {
    const item = ESC_ALL_DATA.find(c => c._studentId === studentId && c._key === complaintKey);
    if (!item) return alert("Complaint not found.");

    ESC_CURRENT_ITEM = item;

    const now = Date.now();
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setText("emd-id",       item.complaintId);
    setText("emd-priority", (item.priority || "Medium").toUpperCase());
    setText("emd-dept",     item.department);
    setText("emd-by",       item.submittedBy);
    setText("emd-filed",    item.filedDate
        ? new Date(item.filedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : "—");
    setText("emd-pending",  formatEscPendingTime(now - item.pendingSince));
    setText("emd-subject",  item.subject);

    const txt = document.getElementById("escDirectiveText");
    if (txt) txt.value = item.raw.vcDirective || "";

    const overlay = document.getElementById("escModalOverlay");
    if (overlay) overlay.style.display = "flex";
};

// ══════════════════════════════════════════════════════
//  CLOSE MODAL
// ══════════════════════════════════════════════════════
window.closeEscModal = function () {
    const overlay = document.getElementById("escModalOverlay");
    if (overlay) overlay.style.display = "none";
    ESC_CURRENT_ITEM = null;
};

// Close modal on outside click
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("escModalOverlay")?.addEventListener("click", function (e) {
        if (e.target === this) closeEscModal();
    });
});

// ══════════════════════════════════════════════════════
//  SAVE VC DIRECTIVE (Send Remarks)
// ══════════════════════════════════════════════════════
window.saveEscDirective = async function () {
    if (!ESC_CURRENT_ITEM) return alert("No complaint selected.");
    const directive = document.getElementById("escDirectiveText")?.value.trim();
    if (!directive) return alert("Please write a directive before sending.");

    try {
        const path = `complaints/${ESC_CURRENT_ITEM._studentId}/${ESC_CURRENT_ITEM._key}`;
        await update(ref(db, path), {
            vcDirective: directive,
            vcDirectiveAt: Date.now(),
            lastUpdate: Date.now()
        });

        // Send notification to student
        await push(ref(db, `notifications/${ESC_CURRENT_ITEM._studentId}`), {
            title: "VC Directive Issued",
            message: `VC has issued a directive on your complaint ${ESC_CURRENT_ITEM.complaintId}: ${directive}`,
            timestamp: Date.now(),
            isRead: false,
            type: "vc_directive"
        });

        alert(`✅ Directive sent successfully for ${ESC_CURRENT_ITEM.complaintId}`);
        closeEscModal();
    } catch (err) {
        console.error("Directive save error:", err);
        alert("❌ Failed to send directive. Please try again.");
    }
};

// ══════════════════════════════════════════════════════
//  MARK COMPLAINT AS RESOLVED (by VC)
// ══════════════════════════════════════════════════════
window.markEscResolved = async function () {
    if (!ESC_CURRENT_ITEM) return alert("No complaint selected.");
    const remarks = document.getElementById("escDirectiveText")?.value.trim();
    if (!remarks) return alert("Please write remarks before marking resolved.");

    if (!confirm(`Mark complaint ${ESC_CURRENT_ITEM.complaintId} as RESOLVED?`)) return;

    try {
        const path = `complaints/${ESC_CURRENT_ITEM._studentId}/${ESC_CURRENT_ITEM._key}`;
        await update(ref(db, path), {
            status: "Resolved",
            vcRemarks: remarks,
            vcResolvedAt: Date.now(),
            vcResolved: true,
            lastUpdate: Date.now()
        });

        await push(ref(db, `notifications/${ESC_CURRENT_ITEM._studentId}`), {
            title: "Your Complaint has been Resolved by VC",
            message: `Complaint ${ESC_CURRENT_ITEM.complaintId} resolved. VC Remarks: ${remarks}`,
            timestamp: Date.now(),
            isRead: false,
            type: "vc_resolved"
        });

        alert(`✅ Complaint ${ESC_CURRENT_ITEM.complaintId} marked as Resolved!`);
        closeEscModal();
    } catch (err) {
        console.error("Resolve error:", err);
        alert("❌ Failed to mark resolved. Please try again.");
    }
};

// ══════════════════════════════════════════════════════
//  EXPORT CSV
// ══════════════════════════════════════════════════════
window.exportEscCSV = function () {
    if (ESC_FILTERED_DATA.length === 0) return alert("No data to export.");

    const headers = ["Complaint ID", "Subject", "Department", "Submitted By", "Filed Date", "Pending Since", "Priority", "Status"];
    const now = Date.now();

    const rows = ESC_FILTERED_DATA.map(c => [
        c.complaintId,
        `"${(c.subject || "").replace(/"/g, '""')}"`,
        `"${(c.department || "").replace(/"/g, '""')}"`,
        `"${(c.submittedBy || "").replace(/"/g, '""')}"`,
        c.filedDate ? new Date(c.filedDate).toLocaleDateString("en-GB") : "—",
        formatEscPendingTime(now - c.pendingSince),
        c.priority,
        c.status
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Escalated_Complaints_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// ══════════════════════════════════════════════════════
//  AUTO-LOAD on Sidebar Click + Auth Ready
// ══════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    // Sidebar "Escalated Complaints" (data-section="department") par click → load
    const escNavBtn = document.querySelector('.nav-item[data-section="department"]');
    if (escNavBtn) {
        escNavBtn.addEventListener("click", () => {
            setTimeout(() => loadEscalatedComplaintsVC(), 150);
        });
    }

    // Also load in background after auth (taake data ready rahe)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            setTimeout(() => loadEscalatedComplaintsVC(), 800);
        }
    });
});


window.updateVCPassword = function() {
    const currentPass = document.getElementById("current-password").value;
    const newPass = document.getElementById("new-password").value;
    const user = auth.currentUser;

    if (!currentPass || !newPass) {
        Swal.fire({ icon: 'warning', title: 'Empty Fields!', text: 'Fill your password fields' });
        return;
    }

    // Loading Start
    Swal.fire({
        title: 'Updating...',
        text: 'Please wait...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    if (user) {
        const credential = EmailAuthProvider.credential(user.email, currentPass);

        reauthenticateWithCredential(user, credential)
            .then(() => {
                return updatePassword(user, newPass);
            })
            .then(() => {
                Swal.fire({
                    icon: 'success',
                    title: 'Updated!',
                    text: 'Password successfully changed.',
                    timer: 2000,
                    showConfirmButton: false
                });
                document.getElementById("current-password").value = "";
                document.getElementById("new-password").value = "";
            })
            .catch((error) => {
                // Agar error aaye to loading band kar ke error dikhao
                Swal.close(); 
                console.error(error);
                
                let msg = "Kuch ghalat hua hai.";
                if (error.code === 'auth/wrong-password') msg = "Purana password ghalat hai!";
                if (error.code === 'auth/requires-recent-login') msg = "Security ki wajah se aapko dubara login karna parega.";

                Swal.fire({
                    icon: 'error',
                    title: 'Error!',
                    text: msg
                });
            });
    } else {
        Swal.fire({ icon: 'error', title: 'Error', text: 'User session nahi mila. Login karein.' });
    }
};



