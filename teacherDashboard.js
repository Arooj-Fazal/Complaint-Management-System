// =============================
//  IMPORTS
// =============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, update, get, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// =============================
//  FIREBASE CONFIG
// =============================
const firebaseConfig = {
    apiKey: "AIzaSyCiQJk-1hhGyK4rnUvNIKEnDE35IGTflas",
    authDomain: "complaintmanagementsyste-9c5f8.firebaseapp.com",
    databaseURL: "https://complaintmanagementsyste-9c5f8-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "complaintmanagementsyste-9c5f8",
    storageBucket: "complaintmanagementsyste-9c5f8.appspot.com",
    messagingSenderId: "735335276952",
    appId: "1:735335276952:web:255373716aeb233e2c4bed"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentTeacherUID = "";
let complaintChartInstance = null;

// =============================
//  AUTH STATE LISTENER
// =============================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentTeacherUID = user.uid; 
        
        const userRef = ref(db, `users/${currentTeacherUID}`);
        onValue(userRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                const welcomeEl = document.getElementById("welcomeName");
                if (welcomeEl) welcomeEl.innerText = `Welcome, ${fullName || 'Teacher'}`;

                const displayEl = document.getElementById("displayUserName");
                if (displayEl) displayEl.innerText = fullName || 'Teacher';
            }
        });

        loadProfile(currentTeacherUID);
        loadTeacherNotifications(currentTeacherUID);
        fetchAssignedComplaints(currentTeacherUID); 
        updateDashboardStats(currentTeacherUID); // Real-time stats listener
        loadUrgentComplaints(currentTeacherUID);

    } else {
        window.location.href = "login.html";
    }
});

// =============================
//  COMPLAINTS MANAGEMENT
// =============================
function fetchAssignedComplaints(teacherUID) {
    const complaintsRef = ref(db, 'complaints');
    const tableBody = document.querySelector('#complaintsTable tbody');
    if (!tableBody) return;

    onValue(complaintsRef, (snapshot) => {
        tableBody.innerHTML = "";
        snapshot.forEach((studentSnap) => {
            const studentId = studentSnap.key;
            studentSnap.forEach((complaintSnap) => {
                const c = complaintSnap.val();
                const cId = complaintSnap.key;

                if (c.assignedTo === teacherUID) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${cId}</td>
                        <td>${c.title}</td>
                        <td>${c.category}</td>
                        <td>${new Date(c.timestamp).toLocaleDateString()}</td>
                        <td><span class="p-badge ${c.priority.toLowerCase()}">${c.priority}</span></td>
                        <td><span class="s-badge">${c.status}</span></td>
                        <td>
                            <button onclick="openStatusModal('${studentId}', '${cId}', '${c.status}')" class="action-btn">
                                <i class="fas fa-edit"></i> Update
                            </button>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                }
            });
        });
    });
}

window.openStatusModal = function(sId, cId, currentStatus) {
    const modal = document.getElementById('updateModal');
    if(modal) modal.style.display = 'flex';
    document.getElementById('tempStudentId').value = sId;
    document.getElementById('tempComplaintId').value = cId;
    document.getElementById('statusSelect').value = currentStatus;
};

window.closeModal = function() {
    const modal = document.getElementById('updateModal');
    if (modal) modal.style.display = 'none';
};

// ---------------------------------------------------------
//  SAVE UPDATE (NOTIFIES STUDENT & ADMIN)
// ---------------------------------------------------------
window.saveTeacherUpdate = function() {
    const studentId = document.getElementById('tempStudentId').value;
    const complaintId = document.getElementById('tempComplaintId').value;
    const newStatus = document.getElementById('statusSelect').value;
    const remarks = document.getElementById('teacherRemarks').value; 

    if (!remarks.trim()) {
        alert("Please enter some remarks.");
        return;
    }

    const complaintRef = ref(db, `complaints/${studentId}/${complaintId}`);

    update(complaintRef, {
        status: newStatus,
        teacherRemarks: remarks,
        lastUpdate: Date.now()
    })
    .then(() => {
        // 1. Student Notification
        const studentNotifRef = ref(db, `notifications/${studentId}`);
        push(studentNotifRef, {
            title: "Update on your complaint",
            message: `Status: ${newStatus}. Remarks: ${remarks}`,
            timestamp: Date.now(),
            isRead: false
        });

        // 2. Admin Notification
        const adminNotifRef = ref(db, `admin_notifications`);
        push(adminNotifRef, {
            title: "Complaint Updated by Teacher",
            message: `Teacher updated ${complaintId} to ${newStatus}`,
            complaintId: complaintId,
            teacherUID: currentTeacherUID,
            timestamp: Date.now()
        });

        alert("Status Updated Successfully!");
        closeModal();
        document.getElementById('teacherRemarks').value = ""; 
    })
    .catch((error) => {
        console.error("Error:", error);
        alert("Failed to update database.");
    });
};

// =============================
//  STATS & GRAPH LOGIC (REAL-TIME)
// =============================
function updateDashboardStats(teacherUID) {
    const complaintsRef = ref(db, 'complaints');
    onValue(complaintsRef, (snapshot) => {
        let stats = { total: 0, pending: 0, escalated: 0, resolved: 0 };

        snapshot.forEach(studentSnap => {
            studentSnap.forEach(complaintSnap => {
                const c = complaintSnap.val();
                if (c.assignedTo === teacherUID) {
                    stats.total++;
                    // Status matching logic
                    if (c.status === 'Pending') stats.pending++;
                    else if (c.status === 'Escalated') stats.escalated++;
                    else if (c.status === 'Resolved') stats.resolved++;
                }
            });
        });

        updateCardUI('totalCount', stats.total);
        updateCardUI('pendingCount', stats.pending);
        updateCardUI('escalatedCount', stats.escalated);
        updateCardUI('resolvedCount', stats.resolved);
        renderComplaintChart(stats.total, stats.pending, stats.escalated, stats.resolved);
    });
}

function updateCardUI(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}

function renderComplaintChart(total, pending, escalated, resolved) {
    const ctx = document.getElementById('complaintChart')?.getContext('2d');
    if (!ctx) return;
    if (complaintChartInstance) complaintChartInstance.destroy();

    complaintChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Total', 'Pending', 'Escalated', 'Resolved'],
            datasets: [{
                label: 'Complaints Overview',
                data: [total, pending, escalated, resolved],
                backgroundColor: ['#4e73df', '#f6993f', '#e74c3c', '#2ecc71'],
                borderRadius: 6
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// =============================
//  PROFILE MANAGEMENT
// =============================
function loadProfile(uid) {
    const profileBody = document.getElementById("profileBody");
    const userRef = ref(db, "users/" + uid);

    onValue(userRef, (snapshot) => {
        const data = snapshot.val();
        if(!data || !profileBody) return;

        profileBody.innerHTML = `
            <tr>
                <td>${data.firstName || ''}</td>
                <td>${data.lastName || ''}</td>
                <td>${data.email || ''}</td>
                <td>******</td>
                <td><button class="edit-btn" id="editBtn">Edit</button></td>
            </tr>
        `;
        document.getElementById("editBtn").onclick = () => enableEditing(data, uid);
    });
}

function enableEditing(data, uid) {
    const profileBody = document.getElementById("profileBody");
    profileBody.innerHTML = `
        <tr>
            <td><input id="firstNameInput" value="${data.firstName || ''}"></td>
            <td><input id="lastNameInput" value="${data.lastName || ''}"></td>
            <td><input id="emailInput" value="${data.email || ''}" disabled></td>
            <td><input id="passwordInput" type="password" value="${data.password || ''}"></td>
            <td>
                <button class="save-btn" id="saveBtn">Save</button>
                <button class="cancel-btn" id="cancelBtn">Cancel</button>
            </td>
        </tr>
    `;
    document.getElementById("saveBtn").onclick = () => saveProfile(uid);
    document.getElementById("cancelBtn").onclick = () => loadProfile(uid);
}

function saveProfile(uid) {
    const updatedData = {
        firstName: document.getElementById("firstNameInput").value,
        lastName: document.getElementById("lastNameInput").value,
        password: document.getElementById("passwordInput").value
    };
    update(ref(db, "users/" + uid), updatedData).then(() => {
        alert("Profile Updated!");
        loadProfile(uid);
    });
}

// =============================
//  NOTIFICATIONS & URGENT
// =============================
function loadTeacherNotifications(teacherUID) {
    const list = document.getElementById("notifList");
    const badge = document.getElementById("notifBadge");
    onValue(ref(db, `notifications/${teacherUID}`), snapshot => {
        if(!list) return;
        list.innerHTML = '';
        let count = 0;
        snapshot.forEach(child => {
            const data = child.val();
            count++;
            const li = document.createElement('li');
            li.innerHTML = `<strong>${data.title}</strong><br><small>${data.message}</small>`;
            list.appendChild(li);
        });
        if(badge) badge.textContent = count;
    });
}

function loadUrgentComplaints(teacherUID) {
    const urgentListDiv = document.getElementById("urgentList");
    onValue(ref(db, 'complaints'), (snapshot) => {
        let htmlContent = "";
        snapshot.forEach(studentSnap => {
            studentSnap.forEach(c => {
                const data = c.val();
                if (data.assignedTo === teacherUID && data.priority === "High" && data.status !== "Resolved") {
                    const displayTitle = data.title || 'General Issue';
                    const timeStr = data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Recently";
                    htmlContent += `
                        <div class="urgent-item">
                            <div class="complaint-title-text">• ${displayTitle}</div>
                            <div class="status-badge-urgent">${data.status}</div>
                            <div class="time-text-urgent">${timeStr}</div>
                        </div>`;
                }
            });
        });
        if(urgentListDiv) urgentListDiv.innerHTML = htmlContent || '<p>No high priority complaints.</p>';
    });
}

// =============================
//  UI HELPERS & LOGOUT
// =============================
window.showSection = function(sectionId) {
    const sectionIds = ['dashboardOverview', 'dashboardSection', 'notificationsSection', 'profileSection'];
    sectionIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    });
    const activeSection = document.getElementById(sectionId);
    if (activeSection) activeSection.style.display = 'block';
};

document.addEventListener("DOMContentLoaded", () => {
    showSection('dashboardOverview');
    
    const menuToggle = document.getElementById("menu-toggle");
    const sidebar = document.getElementById("sidebar");
    if (menuToggle && sidebar) {
        menuToggle.onclick = () => sidebar.classList.toggle("active");
    }

// const logoutBtn = document.getElementById("logoutBtn");
// if (logoutBtn) {
//     logoutBtn.onclick = () => {
//         // Confirmation Pop-up
//         const confirmLogout = confirm("Are you sure you want to logout??");

//         if (confirmLogout) {
//             // Agar user 'OK' click kare to logout kar do
//             signOut(auth).then(() => {
//                 window.location.href = "login.html";
//             }).catch((error) => {
//                 console.error("Logout Error:", error);
//             });
//         } else {
//             // Agar user 'Cancel' click kare to kuch nahi hoga
//             // User dashboard par hi rahega
//             console.log("Logout cancelled");
//         }
//     };
// }

const logoutBtn = document.getElementById("logoutBtn");
const logoutModal = document.getElementById("logoutModal");
const confirmBtn = document.getElementById("confirmLogoutBtn");
const cancelBtn = document.getElementById("cancelLogoutBtn");

if (logoutBtn && logoutModal) {
    // 1. Sidebar logout par click karne se modal show hoga
    logoutBtn.onclick = (e) => {
        e.preventDefault(); // Default redirect ya reload roknay ke liye
        logoutModal.style.display = "flex"; // Modal show (Flex use karein center align ke liye)
    };

    // 2. 'Stay Here' (Cancel) button par modal hide hoga
    cancelBtn.onclick = () => {
        logoutModal.style.display = "none";
    };

    // 3. 'Yes, Logout' (OK) button par actual signout hoga
    confirmBtn.onclick = () => {
        signOut(auth).then(() => {
            window.location.href = "login.html";
        }).catch((error) => {
            console.error("Logout Error:", error);
            alert("Kuch masla hua, dobara koshish karein.");
        });
    };

    // 4. Agar user modal ke bahar (background par) click kare to bhi modal band ho jaye
    window.onclick = (event) => {
        if (event.target == logoutModal) {
            logoutModal.style.display = "none";
        }
    };
}

});
