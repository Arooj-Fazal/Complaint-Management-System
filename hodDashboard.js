import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, update, push, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// =============================================
//  FIREBASE CONFIG
// =============================================
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
const storage = getStorage(app);

let currentHODUID = "";
let currentHODDepartment = "";
let facultyChartInstance = null;
let facultyDataArray = [];

// =============================================
//  LOGOUT LOGIC
// =============================================
const logoutBtn = document.querySelector('.logout-btn');
const logoutModal = document.getElementById('logoutModal');
const confirmLogout = document.getElementById('confirmLogout');
const cancelLogout = document.getElementById('cancelLogout');

if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logoutModal.style.display = 'flex';
    });
}
if (cancelLogout) {
    cancelLogout.addEventListener('click', () => { logoutModal.style.display = 'none'; });
}
if (confirmLogout) {
    confirmLogout.addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = 'login.html';
        }).catch((error) => { console.error("Sign out error:", error); });
    });
}
window.addEventListener('click', (event) => {
    if (event.target == logoutModal) { logoutModal.style.display = 'none'; }
});

// =============================================
//  SIDEBAR NAVIGATION
// =============================================
document.querySelectorAll('aside nav a').forEach(link => {
    link.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#logout') return;

        e.preventDefault();

        document.querySelectorAll('.dashboard-section').forEach(sec => {
            sec.style.display = 'none';
        });
        document.querySelectorAll('aside nav li').forEach(li => {
            li.classList.remove('active');
        });

        const targetId = href.replace('#', '');
        const targetSection = document.getElementById(targetId);
        if (targetSection) targetSection.style.display = 'block';
        this.parentElement.classList.add('active');

        if (targetId === 'escalations') loadEscalatedComplaints();
        if (targetId === 'faculty') loadFacultyPerformance();
        if (targetId === 'logs') loadResolvedLogs();
    });
});

// =============================================
//  AUTH STATE
//  FIX: currentHODUID set hone ke BAAD hi sab load hoga
//  FIX: ek baar hi load hoga — duplicate listeners nahi banenge
// =============================================
let dataLoaded = false; // prevent duplicate loads

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentHODUID = user.uid;
        console.log("HOD logged in UID:", currentHODUID);

        const userRef = ref(db, 'users/' + user.uid);
        // FIX: get() use kiya onValue ki jagah — sirf ek baar chalega
        get(userRef).then((snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            const fName = data.firstName || "";
            const lName = data.lastName || "";
            let finalName = `${fName} ${lName}`.trim() || user.email.split('@')[0];
            currentHODDepartment = data.department || "";

            console.log("HOD Department:", currentHODDepartment);
            console.log("HOD UID confirmed:", currentHODUID);

            const headerNameDisp = document.getElementById('user-name');
            if (headerNameDisp) headerNameDisp.innerText = finalName;

            const bannerNameDisp = document.getElementById('banner-user-name');
            if (bannerNameDisp) bannerNameDisp.innerText = finalName;

            const deptDisp = document.getElementById('user-dept');
            if (deptDisp) deptDisp.innerText = currentHODDepartment || "Your Department";

            // FIX: sirf ek baar load karo
            if (!dataLoaded && currentHODUID && currentHODDepartment) {
                dataLoaded = true;
                updateDashboardStats();
                loadHighPriorityComplaintsTable();
                loadEscalatedComplaints();
                startAutoEscalationChecker();  
            }
        });

    } else {
        window.location.href = "login.html";
    }
});

// =============================================
//  DASHBOARD STATS
// =============================================
function updateDashboardStats() {
    if (!currentHODUID || !currentHODDepartment) return;

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    get(ref(db, 'users')).then((usersSnapshot) => {
        let totalFaculty = 0;
        if (usersSnapshot.exists()) {
            usersSnapshot.forEach((userSnap) => {
                const u = userSnap.val();
                if (
                    u.role === "teacher" &&
                    u.department &&
                    u.department.toLowerCase() === currentHODDepartment.toLowerCase()
                ) {
                    totalFaculty++;
                }
            });
        }
        const el = document.getElementById('stat-faculty');
        if (el) el.innerText = totalFaculty;
    });

    onValue(ref(db, 'complaints'), (snapshot) => {
        let urgentEscalations = 0;
        let activeUnderProcess = 0;
        let resolvedMonthly = 0;
        let escalationCount = 0;

        snapshot.forEach((studentSnap) => {
            studentSnap.forEach((complaintSnap) => {
                const c = complaintSnap.val();
                if ((c.assignedTo || "").trim() !== currentHODUID.trim()) return;

                if (c.status === "Escalated" && c.priority === "High") urgentEscalations++;
                if (c.status === "Escalated") escalationCount++;
                if (c.status === "In Progress") activeUnderProcess++;
                if (c.status === "Resolved" && c.hodResolvedAt) {
                    const d = new Date(c.hodResolvedAt);
                    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                        resolvedMonthly++;
                    }
                }
            });
        });

        const urgentEl = document.getElementById('stat-urgent');
        const activeEl = document.getElementById('stat-active');
        const resolvedEl = document.getElementById('stat-resolved');
        const badgeEl = document.getElementById('escalation-badge');

        if (urgentEl) urgentEl.innerText = urgentEscalations;
        if (activeEl) activeEl.innerText = activeUnderProcess;
        if (resolvedEl) resolvedEl.innerText = resolvedMonthly;
        if (badgeEl) badgeEl.innerText = escalationCount;
    });
}

// =============================================
//  HIGH PRIORITY TABLE
// =============================================
function loadHighPriorityComplaintsTable() {
    if (!currentHODUID) return;

    const tableBody = document.getElementById('overview-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">
        <i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>`;

    onValue(ref(db, 'complaints'), (snapshot) => {
        tableBody.innerHTML = "";
        let hasData = false;

        snapshot.forEach((studentSnap) => {
            const studentId = studentSnap.key;
            studentSnap.forEach((complaintSnap) => {
                const c = complaintSnap.val();
                const cId = complaintSnap.key;

                const assignedTo = (c.assignedTo || "").trim();

                if (
                    assignedTo === currentHODUID.trim() &&
                    c.status === "Escalated" &&
                    c.priority === "High"
                ) {
                    hasData = true;
                    const displayId = c.complaintId || cId;
                    const teacherName = c.escalatedFromName || "Unknown";
                    const dept = c.department || currentHODDepartment;
                    const pendingTime = c.escalatedAt ? getTimeDiff(c.escalatedAt) : getTimeDiff(c.timestamp);

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${displayId}</strong></td>
                        <td>${dept}</td>
                        <td><i class="fas fa-user-tie" style="color:#115562;margin-right:5px;"></i>${teacherName}</td>
                        <td class="urgent-text">${pendingTime}</td>
                        <td>
                            <button class="solve-btn" onclick="openReviewModal('${studentId}','${cId}')">
                                SOLVE / REVIEW
                            </button>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                }
            });
        });

        if (!hasData) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#999;">
                No high priority complaints found</td></tr>`;
        }
    });
}

// =============================================
//  ESCALATIONS — MAIN FUNCTION (FULLY FIXED)
//  FIX 1: ab parameter nahi — currentHODUID directly use karta hai
//  FIX 2: trim() se UID mismatch fix
//  FIX 3: sirf ek onValue listener — duplicate nahi
// =============================================
function loadEscalatedComplaints() {
    if (!currentHODUID) {
        console.warn("loadEscalatedComplaints: currentHODUID empty, skipping.");
        return;
    }

    console.log("loadEscalatedComplaints running for HOD UID:", currentHODUID);

    const tableBody = document.getElementById('escalation-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr class="no-data-row">
        <td colspan="7"><i class="fas fa-spinner fa-spin"></i> Loading...</td>
    </tr>`;

    onValue(ref(db, 'complaints'), (snapshot) => {
        tableBody.innerHTML = "";
        let count = 0;

        if (!snapshot.exists()) {
            tableBody.innerHTML = `<tr class="no-data-row"><td colspan="7">No complaints found.</td></tr>`;
            const badge = document.getElementById('escalation-badge');
            if (badge) badge.textContent = 0;
            return;
        }

        snapshot.forEach((studentSnap) => {
            const studentId = studentSnap.key;

            studentSnap.forEach((complaintSnap) => {
                const c = complaintSnap.val();
                const cId = complaintSnap.key;

                // FIX: trim() se whitespace mismatch avoid
                const assignedTo = (c.assignedTo || "").trim();
                const hodUID = currentHODUID.trim();

                // DEBUG log
                console.log(
                    `${cId} | assignedTo: "${assignedTo}" | hodUID: "${hodUID}" | match: ${assignedTo === hodUID} | status: ${c.status}`
                );

                if (assignedTo === hodUID && c.status === "Escalated") {
                    count++;

                    const submittedDate = c.timestamp
                        ? new Date(c.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—';

                    const pendingTime = c.escalatedAt ? getTimeDiff(c.escalatedAt) : getTimeDiff(c.timestamp);
                    const priority = c.priority || 'Medium';
                    const teacherName = c.escalatedFromName || 'Unknown Teacher';
                    const displayId = c.complaintId || cId;

                    const tr = document.createElement('tr');
                    tr.setAttribute('data-priority', priority);
                    tr.innerHTML = `
                        <td><strong>${displayId}</strong></td>
                        <td><i class="fas fa-user-tie" style="color:#115562;margin-right:6px;"></i>${teacherName}</td>
                        <td>${submittedDate}</td>
                        <td class="urgent-text">${pendingTime}</td>
                        <td><span class="priority-badge ${priority.toLowerCase()}">${priority}</span></td>
                        <td><span class="status-badge escalated">Escalated</span></td>
                        <td>
                            <button class="review-btn" onclick="openReviewModal('${studentId}','${cId}')">
                                <i class="fas fa-eye"></i> Review
                            </button>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                }
            });
        });

        const badge = document.getElementById('escalation-badge');
        if (badge) badge.textContent = count;

        if (count === 0) {
            tableBody.innerHTML = `<tr class="no-data-row">
                <td colspan="7" style="text-align:center;padding:20px;color:#999;">
                    <i class="fas fa-check-circle"></i> No escalated complaints at the moment.
                </td>
            </tr>`;
        }
    });
}

// =============================================
//  TIME DIFFERENCE
// =============================================
function getTimeDiff(timestamp) {
    if (!timestamp) return '—';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days} Day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} Hour${hours > 1 ? 's' : ''}`;
    return `${mins} Min${mins > 1 ? 's' : ''}`;
}

// =============================================
//  FILTER ESCALATIONS — SINGLE DEFINITION (no duplicate)
// =============================================
window.filterEscalations = function (priority) {
    const tableBody = document.getElementById('escalation-table-body');
    if (!tableBody) return;

    document.querySelectorAll('.filter-bar .filter-btn').forEach(btn => {
        btn.classList.remove('active-filter');
        const btnText = btn.innerText.trim().toLowerCase();
        if (btnText === priority.toLowerCase() || (priority === 'all' && btnText === 'all')) {
            btn.classList.add('active-filter');
        }
    });

    tableBody.querySelectorAll('tr:not(.no-data-row)').forEach(row => {
        const badge = row.querySelector('.priority-badge');
        if (!badge) return;
        const rowPriority = badge.innerText.trim().toLowerCase();
        row.style.display = (priority === 'all' || rowPriority === priority.toLowerCase()) ? "" : "none";
    });
};

// =============================================
//  REVIEW MODAL — OPEN
// =============================================
window.openReviewModal = function (studentId, complaintId) {
    const modal = document.getElementById('reviewModal');
    if (!modal) return;

    document.getElementById('modal-student-id').value = studentId;
    document.getElementById('modal-complaint-key').value = complaintId;

    get(ref(db, `complaints/${studentId}/${complaintId}`)).then((snapshot) => {
        if (!snapshot.exists()) return;
        const c = snapshot.val();

        document.getElementById('modal-complaint-id').textContent = c.complaintId || complaintId;
        document.getElementById('modal-teacher-name').textContent = c.escalatedFromName || 'Unknown Teacher';
        document.getElementById('modal-title').textContent = c.title || '—';
        document.getElementById('modal-date').textContent = c.timestamp
            ? new Date(c.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
        document.getElementById('modal-priority').textContent = c.priority || '—';
        document.getElementById('modal-reason').textContent = c.escalationReason || 'Auto-escalated due to no response';
        document.getElementById('hod-status').value = 'Resolved';
        document.getElementById('hod-remarks').value = '';
    });

    modal.style.display = 'flex';
};

window.closeReviewModal = function () {
    const modal = document.getElementById('reviewModal');
    if (modal) modal.style.display = 'none';
};

document.getElementById('reviewModal')?.addEventListener('click', function (e) {
    if (e.target === this) closeReviewModal();
});

// =============================================
//  SAVE HOD REVIEW
// =============================================
window.saveHODReview = async function () {
    const studentId = document.getElementById('modal-student-id').value;
    const complaintId = document.getElementById('modal-complaint-key').value;
    const newStatus = document.getElementById('hod-status').value;
    const remarks = document.getElementById('hod-remarks').value.trim();

    if (!remarks) {
        alert("Please write your remarks before saving.");
        return;
    }

    try {
        await update(ref(db, `complaints/${studentId}/${complaintId}`), {
            status: newStatus,
            hodRemarks: remarks,
            hodResolvedBy: currentHODUID,
            hodResolvedAt: Date.now(),
            lastUpdate: Date.now()
        });

        await push(ref(db, `notifications/${studentId}`), {
            title: `Your complaint has been ${newStatus}`,
            message: `HOD reviewed your complaint. Remarks: ${remarks}`,
            timestamp: Date.now(),
            isRead: false,
            type: "hod_update"
        });

        await push(ref(db, `admin_notifications`), {
            title: `HOD ${newStatus} a complaint`,
            message: `Complaint ${complaintId} marked as "${newStatus}" by HOD. Remarks: ${remarks}`,
            timestamp: Date.now(),
            type: "hod_update"
        });

        alert(`Complaint successfully marked as "${newStatus}"!`);
        closeReviewModal();
        updateDashboardStats();
        loadHighPriorityComplaintsTable();

    } catch (error) {
        console.error("Error saving HOD review:", error);
        alert("Something went wrong. Please try again.");
    }
};

// =============================================
//  FACULTY PERFORMANCE
// =============================================
function loadFacultyPerformance() {
    if (!currentHODUID || !currentHODDepartment) return;

    const tableBody = document.getElementById('faculty-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr class="no-data-row"><td colspan="9">
        <i class="fas fa-spinner fa-spin"></i> Loading faculty data...</td></tr>`;

    get(ref(db, 'users')).then((usersSnapshot) => {
        if (!usersSnapshot.exists()) return;

        const teachers = [];
        usersSnapshot.forEach((userSnap) => {
            const u = userSnap.val();
            const uid = userSnap.key;

            if (
                u.role === "teacher" &&
                u.department &&
                u.department.toLowerCase() === currentHODDepartment.toLowerCase()
            ) {
                teachers.push({
                    uid,
                    name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown',
                    email: u.email || '—',
                    dept: u.department
                });
            }
        });

        if (teachers.length === 0) {
            tableBody.innerHTML = `<tr class="no-data-row"><td colspan="9">
                <i class="fas fa-info-circle"></i> No teachers found in this department.</td></tr>`;
            return;
        }

        get(ref(db, 'complaints')).then((complaintsSnapshot) => {
            const statsMap = {};
            teachers.forEach(t => {
                statsMap[t.uid] = { assigned: 0, resolved: 0, escalated: 0, pending: 0 };
            });

            if (complaintsSnapshot.exists()) {
                complaintsSnapshot.forEach((studentSnap) => {
                    studentSnap.forEach((complaintSnap) => {
                        const c = complaintSnap.val();
                        const originalTeacher = c.escalatedFromUID || null;
                        const currentAssignee = c.assignedTo || null;

                        if (currentAssignee && statsMap[currentAssignee]) {
                            statsMap[currentAssignee].assigned++;
                            if (c.status === "Resolved") statsMap[currentAssignee].resolved++;
                            else if (c.status === "Pending" || c.status === "In Progress")
                                statsMap[currentAssignee].pending++;
                        }

                        if (c.status === "Escalated" && originalTeacher && statsMap[originalTeacher]) {
                            if (currentAssignee !== originalTeacher) statsMap[originalTeacher].assigned++;
                            statsMap[originalTeacher].escalated++;
                        }
                    });
                });
            }

            facultyDataArray = teachers.map(t => {
                const s = statsMap[t.uid];
                const rate = s.assigned > 0 ? Math.round((s.resolved / s.assigned) * 100) : 0;
                let perfLevel = "poor";
                if (rate >= 80) perfLevel = "good";
                else if (rate >= 50) perfLevel = "average";

                return { uid: t.uid, name: t.name, email: t.email, dept: t.dept, ...s, rate, perfLevel };
            });

            updateFacultyStatCards(facultyDataArray);
            renderFacultyTable(facultyDataArray);
            renderFacultyChart(facultyDataArray);
        });
    });
}

function updateFacultyStatCards(data) {
    const totalResolved = data.reduce((sum, t) => sum + t.resolved, 0);
    const totalEscalated = data.reduce((sum, t) => sum + t.escalated, 0);
    const top = data.reduce((best, t) => t.rate > (best ? best.rate : -1) ? t : best, null);

    const facTotalEl = document.getElementById('fac-total');
    const facResolvedEl = document.getElementById('fac-resolved');
    const facEscalatedEl = document.getElementById('fac-escalated');
    const facTopEl = document.getElementById('fac-top-performer');

    if (facTotalEl) facTotalEl.innerText = data.length;
    if (facResolvedEl) facResolvedEl.innerText = totalResolved;
    if (facEscalatedEl) facEscalatedEl.innerText = totalEscalated;
    if (facTopEl) facTopEl.innerText = top ? top.name.split(' ')[0] : '—';
}

function renderFacultyTable(data) {
    const tableBody = document.getElementById('faculty-table-body');
    if (!tableBody) return;

    if (data.length === 0) {
        tableBody.innerHTML = `<tr class="no-data-row"><td colspan="9">
            <i class="fas fa-info-circle"></i> No faculty data found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = "";
    data.forEach((t, index) => {
        const rateColor = t.perfLevel === "good" ? "#2ecc71" : t.perfLevel === "average" ? "#f39c12" : "#e74c3c";
        const tr = document.createElement('tr');
        tr.setAttribute('data-perf', t.perfLevel);
        tr.setAttribute('data-name', t.name.toLowerCase());
        tr.innerHTML = `
            <td><strong>${index + 1}</strong></td>
            <td><i class="fas fa-user-tie" style="color:#115562;margin-right:6px;"></i><strong>${t.name}</strong></td>
            <td style="text-align:center;">${t.assigned}</td>
            <td style="text-align:center;color:#27ae60;font-weight:700;">${t.resolved}</td>
            <td style="text-align:center;color:#e74c3c;font-weight:700;">${t.escalated}</td>
            <td style="text-align:center;color:#f39c12;font-weight:700;">${t.pending}</td>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="rate-bar-bg">
                        <div class="rate-bar-fill" style="width:${t.rate}%;background:${rateColor};"></div>
                    </div>
                    <span style="font-weight:700;color:${rateColor};font-size:0.85rem;">${t.rate}%</span>
                </div>
            </td>
            <td>
                <span class="perf-badge ${t.perfLevel}">
                    ${t.perfLevel === 'good' ? '🟢 Good' : t.perfLevel === 'average' ? '🟡 Average' : '🔴 Poor'}
                </span>
            </td>
            <td>
                <button class="detail-btn" onclick="openTeacherModal('${t.uid}')">
                    <i class="fas fa-eye"></i> View
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function renderFacultyChart(data) {
    const ctx = document.getElementById('facultyChart');
    if (!ctx) return;
    if (facultyChartInstance) facultyChartInstance.destroy();

    facultyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(t => t.name.split(' ')[0]),
            datasets: [
                { label: 'Resolved', data: data.map(t => t.resolved), backgroundColor: 'rgba(46,204,113,0.8)', borderColor: '#27ae60', borderWidth: 2, borderRadius: 6 },
                { label: 'Pending', data: data.map(t => t.pending), backgroundColor: 'rgba(243,156,18,0.8)', borderColor: '#e67e22', borderWidth: 2, borderRadius: 6 },
                { label: 'Escalated', data: data.map(t => t.escalated), backgroundColor: 'rgba(231,76,60,0.8)', borderColor: '#c0392b', borderWidth: 2, borderRadius: 6 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { font: { size: 13 }, padding: 20 } } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 12 } } },
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 12 } }, grid: { color: 'rgba(0,0,0,0.05)' } }
            }
        }
    });
}

window.filterFacultyTable = function () {
    const searchVal = document.getElementById('faculty-search-input')?.value.toLowerCase() || '';
    const statusVal = document.getElementById('faculty-status-filter')?.value || 'all';
    const filtered = facultyDataArray.filter(t => {
        return t.name.toLowerCase().includes(searchVal) && (statusVal === 'all' || t.perfLevel === statusVal);
    });
    renderFacultyTable(filtered);
};

window.sortFacultyTable = function () {
    const sortVal = document.getElementById('faculty-sort')?.value || 'name';
    const sorted = [...facultyDataArray].sort((a, b) => {
        if (sortVal === 'name') return a.name.localeCompare(b.name);
        if (sortVal === 'resolved') return b.resolved - a.resolved;
        if (sortVal === 'escalated') return b.escalated - a.escalated;
        if (sortVal === 'rate') return b.rate - a.rate;
        return 0;
    });
    renderFacultyTable(sorted);
};

window.openTeacherModal = function (teacherUID) {
    const modal = document.getElementById('teacherDetailModal');
    if (!modal) return;
    const teacher = facultyDataArray.find(t => t.uid === teacherUID);
    if (!teacher) return;

    document.getElementById('td-name').textContent = teacher.name;
    document.getElementById('td-email').textContent = teacher.email;
    document.getElementById('td-dept').textContent = teacher.dept;
    document.getElementById('td-assigned').textContent = teacher.assigned;
    document.getElementById('td-resolved').textContent = teacher.resolved;
    document.getElementById('td-escalated').textContent = teacher.escalated;
    document.getElementById('td-pending').textContent = teacher.pending;

    const rateText = document.getElementById('td-rate-text');
    const rateBar = document.getElementById('td-rate-bar');
    if (rateText) rateText.textContent = `${teacher.rate}%`;
    if (rateBar) {
        rateBar.style.width = `${teacher.rate}%`;
        rateBar.style.background = teacher.perfLevel === 'good'
            ? 'linear-gradient(90deg, #115562, #2ecc71)'
            : teacher.perfLevel === 'average'
                ? 'linear-gradient(90deg, #f39c12, #e67e22)'
                : 'linear-gradient(90deg, #e74c3c, #c0392b)';
    }
    modal.style.display = 'flex';
};

window.closeTeacherModal = function () {
    const modal = document.getElementById('teacherDetailModal');
    if (modal) modal.style.display = 'none';
};

document.getElementById('teacherDetailModal')?.addEventListener('click', function (e) {
    if (e.target === this) closeTeacherModal();
});

// =============================================
//  RESOLVED LOGS
// =============================================
function loadResolvedLogs() {
    if (!currentHODUID) return;

    const tableBody = document.getElementById('logs-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr class="no-data-row"><td colspan="5">
        <i class="fas fa-spinner fa-spin"></i> Loading logs...</td></tr>`;

    onValue(ref(db, 'complaints'), (snapshot) => {
        tableBody.innerHTML = "";
        let hasData = false;

        snapshot.forEach((studentSnap) => {
            studentSnap.forEach((complaintSnap) => {
                const c = complaintSnap.val();
                const cId = complaintSnap.key;

                if (c.hodResolvedBy === currentHODUID && c.status === "Resolved") {
                    hasData = true;
                    const displayId = c.complaintId || cId;
                    const resolvedDate = c.hodResolvedAt
                        ? new Date(c.hodResolvedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—';

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${displayId}</strong></td>
                        <td>${c.title || '—'}</td>
                        <td>${c.escalatedFromName || 'Unknown Teacher'}</td>
                        <td>${resolvedDate}</td>
                        <td style="font-size:0.82rem;color:#555;">${c.hodRemarks || '—'}</td>
                    `;
                    tableBody.appendChild(tr);
                }
            });
        });

        if (!hasData) {
            tableBody.innerHTML = `<tr class="no-data-row"><td colspan="5">
                <i class="fas fa-info-circle"></i> No resolved logs found.</td></tr>`;
        }
    });
}


// ══════════════════════════════════════════════════════
//  AUTO-ESCALATE TO VC (HOD → VC)  — FULLY FIXED
// ══════════════════════════════════════════════════════

const HOD_TO_VC_THRESHOLD_MS = 60 * 1000; // 1 minute
const alreadyEscalatedToVC = new Set();
let autoEscalateInterval = null;

async function autoEscalateToVC() {
    if (!currentHODUID) {
        console.warn("⏸ autoEscalateToVC skipped: HOD UID not ready");
        return;
    }

    try {
        // STEP 1: VC ka UID nikalo
        const usersSnap = await get(ref(db, 'users'));
        let vcUID = null;
        let vcName = "Vice Chancellor";

        if (usersSnap.exists()) {
            usersSnap.forEach((u) => {
                const ud = u.val();
                if ((ud.role || "").toLowerCase() === "vc") {
                    vcUID = u.key;
                    vcName = `${ud.firstName || ''} ${ud.lastName || ''}`.trim() || "VC";
                }
            });
        }

        if (!vcUID) {
            console.error("❌ No VC found in users node!");
            return;
        }

        // STEP 2: Complaints check karo
        const snapshot = await get(ref(db, 'complaints'));
        if (!snapshot.exists()) return;

        const now = Date.now();
        const promises = [];

        snapshot.forEach((studentSnap) => {
            const studentId = studentSnap.key;

            studentSnap.forEach((complaintSnap) => {
                const c = complaintSnap.val();
                const cId = complaintSnap.key;
                const uniqueKey = `${studentId}_${cId}`;

                // Already escalated to VC — skip
                if (c.escalatedToVC === true) {
                    alreadyEscalatedToVC.add(uniqueKey);
                    return;
                }
                if (alreadyEscalatedToVC.has(uniqueKey)) return;

                // Sirf is HOD ki complaints
                const assignedTo = (c.assignedTo || "").trim();
                if (assignedTo !== currentHODUID.trim()) return;

                // Sirf Escalated status wali
                if (c.status !== "Escalated") return;

                // Sirf High ya Critical priority
                const priority = (c.priority || "").toLowerCase();
                if (priority !== "high" && priority !== "critical") return;

                // Time check
                const referenceTime = c.escalatedAt || c.timestamp || 0;
                if (!referenceTime) return;

                const pendingMs = now - referenceTime;
                if (pendingMs < HOD_TO_VC_THRESHOLD_MS) {
                    console.log(`⏳ Not ready yet: ${c.complaintId || cId} — ${Math.floor(pendingMs / 1000)}s / 60s`);
                    return;
                }

                console.log(`🚨 Escalating to VC: ${c.complaintId || cId} (${Math.floor(pendingMs / 1000)}s pending)`);
                alreadyEscalatedToVC.add(uniqueKey);

                const updatePromise = update(ref(db, `complaints/${studentId}/${cId}`), {
                    assignedTo: vcUID,               // VC ko assign karo
                    previousAssignee: currentHODUID, // HOD ka record
                    escalatedToVC: true,             // ✅ VC dashboard condition
                    escalated: true,                 // ✅ General escalation flag
                    vcEscalatedAt: Date.now(),
                    escalatedFromHOD: currentHODUID,
                    escalatedFromHODAt: Date.now(),
                    escalationLevel: "VC",
                    escalationReason: "Auto-escalated: HOD did not respond within 1 minute",
                    lastUpdate: Date.now()
                    // status "Escalated" hi rehne do — change nahi karna
                }).then(() => {
                    console.log(`✅ ${c.complaintId || cId} → VC (${vcName}) escalated successfully`);

                    // VC ko notification
                    push(ref(db, `notifications/${vcUID}`), {
                        title: "🚨 Urgent: Complaint Escalated from HOD",
                        message: `Complaint ${c.complaintId || cId} unresolved at HOD level. Immediate action required.`,
                        complaintId: c.complaintId || cId,
                        studentId: studentId,
                        complaintKey: cId,
                        priority: c.priority,
                        department: c.department || currentHODDepartment,
                        timestamp: Date.now(),
                        isRead: false,
                        type: "auto_escalation_to_vc"
                    });

                    // Student ko notification
                    push(ref(db, `notifications/${studentId}`), {
                        title: "Your complaint has been escalated to VC",
                        message: `Complaint ${c.complaintId || cId} escalated to Vice Chancellor for urgent action.`,
                        timestamp: Date.now(),
                        isRead: false,
                        type: "escalated_to_vc"
                    });

                    // HOD ka log
                    push(ref(db, `notifications/${currentHODUID}`), {
                        title: "Complaint Auto-Escalated to VC",
                        message: `Complaint ${c.complaintId || cId} auto-escalated to VC (1-min timeout).`,
                        timestamp: Date.now(),
                        isRead: false,
                        type: "auto_escalation_log"
                    });

                }).catch((err) => {
                    console.error(`❌ Escalation failed for ${cId}:`, err);
                    alreadyEscalatedToVC.delete(uniqueKey); // retry allow karo
                });

                promises.push(updatePromise);
            });
        });

        await Promise.all(promises);

    } catch (err) {
        console.error("Auto-escalate check error:", err);
    }
}

function startAutoEscalationChecker() {
    if (autoEscalateInterval) clearInterval(autoEscalateInterval);
    autoEscalateToVC(); // turant ek baar chala
    autoEscalateInterval = setInterval(autoEscalateToVC, 20000); // har 20s
    console.log("🟢 Auto-escalation checker started (every 20s)");
}