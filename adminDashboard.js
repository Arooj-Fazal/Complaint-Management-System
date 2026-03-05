// ================= FIREBASE IMPORTS =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, onValue, update, remove, push } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, verifyBeforeUpdateEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ================= FIREBASE CONFIG =================
const firebaseConfig = {
    apiKey: "AIzaSyCiQJk-1hhGyK4rnUvNIKEnDE35IGTflas",
    authDomain: "complaintmanagementsyste-9c5f8.firebaseapp.com",
    databaseURL: "https://complaintmanagementsyste-9c5f8-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "complaintmanagementsyste-9c5f8",
    storageBucket: "complaintmanagementsyste-9c5f8.firebasestorage.app",
    messagingSenderId: "735335276952",
    appId: "1:735335276952:web:2f4063e8d7fd6b7d2c4bed",
    measurementId: "G-GDT9SL18NS"
};



// ================= INITIALIZE FIREBASE =================
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Global Chart Instance
let performanceChartInstance = null;
let teachersData = {};
let currentEditingUid = null;

// ================= AUTH CHECK =================
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "adminLogin.html";
        return;
    }
    const uid = user.uid;
    const userRef = ref(db, `users/${uid}`);
    onValue(userRef, (snapshot) => {
        const data = snapshot.val();
        if (!data || data.role !== "admin") {
            alert("Access denied! Only admin can access this page.");
            signOut(auth);
            window.location.href = "adminLogin.html";
            return;
        }
    });
});

// ================= SIDEBAR SWITCH =================
window.showSection = function (sectionId) {
    console.log("Section to show:", sectionId);
    
    // Hide all sections
    document.querySelectorAll(".section-card, .section-content").forEach(sec => {
        sec.style.display = "none";
    });

    // Show active section
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.style.display = "block";
    }

    // Load Data based on section
    if (sectionId === "userManagement") { loadUsers(); }
    if (sectionId === "performance") { fetchPerformanceData(); }
    if (sectionId === "complaints") { fetchTeachersForDropdown(); }
};



// ================= TEACHER APPROVALS =================
const approvableRoles = ["teacher", "hod", "dean", "vc", "warden", "transport"];

onValue(ref(db, "users"), (snapshot) => {
    const users = snapshot.val();
    const tableBody = document.getElementById("pending-teachers-list");
    const pendingCount = document.getElementById("pending-count");
    
    if (!tableBody) return;
    tableBody.innerHTML = "";
    let count = 0;

    for (let uid in users) {
        const user = users[uid];
        // Check if user has an approvable role and status is pending
        if (approvableRoles.includes(user.role) && user.status === "pending") {
            count++;
            tableBody.innerHTML += `
                <tr>
                  <td>${user.firstName} ${user.lastName || ""}</td>
                  <td>${user.universityId || "N/A"}</td>
                  <td>${user.department || "N/A"}</td>
                  <td style="text-transform: capitalize;">${user.role}</td> 
                  <td>${user.email}</td>
                  <td>
                    <button class="btn-approve" onclick="approveUser('${uid}')">Approve</button>
                    <button class="btn-reject" onclick="rejectUser('${uid}')">Reject</button>
                  </td>
                </tr>`;
        }
    }
    if (pendingCount) pendingCount.innerText = count;
});

// Approve Function (Global Scope)
window.approveUser = function (uid) {
    if (!uid) return;
    
    update(ref(db, "users/" + uid), { 
        status: "approved" 
    })
    .then(() => {
        alert("Account Approved successfully! ");
        
    })
    .catch((err) => {
        console.error("Approve Error:", err);
        alert("Error: " + err.message);
    });
};

// Reject Function (Global Scope)
window.rejectUser = function (uid) {
    if (confirm("Are you sure you want to reject this user?")) {
        update(ref(db, "users/" + uid), { 
            status: "rejected" 
        })
        .then(() => alert("User Rejected."))
        .catch(err => alert(err.message));
    }
};

// ================= PROFILE SECTION =================
const profileTable = document.getElementById("profileTable");
onAuthStateChanged(auth, (user) => {
    if (!user || !profileTable) return;
    profileTable.innerHTML = "";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${user.email}</td><td>********</td>
        <td><button onclick="openEdit('${user.email}')">Edit</button></td>`;
    profileTable.appendChild(tr);
});

window.openEdit = function (email) {
    document.getElementById("profileSection").style.display = "none";
    document.getElementById("editSection").style.display = "block";
    document.getElementById("editEmail").value = email;
};

window.cancelEdit = function () {
    document.getElementById("editSection").style.display = "none";
    document.getElementById("profileSection").style.display = "block";
};

window.updateProfile = function () {
    const user = auth.currentUser;
    const newEmail = document.getElementById("editEmail").value.trim();
    const newPassword = document.getElementById("editPassword").value.trim();
    const currentPassword = document.getElementById("currentPassword").value.trim();
    if (!currentPassword) { alert("Please enter current password"); return; }

    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    reauthenticateWithCredential(user, credential)
        .then(() => {
            const tasks = [];
            if (newEmail && newEmail !== user.email) tasks.push(verifyBeforeUpdateEmail(user, newEmail));
            if (newPassword && newPassword.length >= 6) tasks.push(updatePassword(user, newPassword));
            return Promise.all(tasks);
        })
        .then(() => { alert("Profile updated ✅"); location.reload(); })
        .catch(err => alert(err.message));
};

// ==== Assigned complaint===


// Global variable
let allUsersData = {}; 

// Step 1: Teachers ka data fetch aur organize karna
function fetchTeachersForDropdown() {
    const usersRef = ref(db, "users");
    onValue(usersRef, (snapshot) => {
        const users = snapshot.val() || {};
        allUsersData = users; // Global variable for department lookup
        
        teachersData = {}; 
        for (let uid in users) {
            const user = users[uid];
            // Sirf approved staff (students aur admin ke ilawa)
            if (user.status === "approved" && user.role !== "student" && user.role !== "admin") {
                teachersData[uid] = {
                    name: user.firstName,
                    dept: user.department || "General",
                    role: user.role.toUpperCase()
                };
            }
        }
        renderAssignTable();
    });
}

// Step 2: Table render karna Grouped Dropdown ke sath
function renderAssignTable() {
    const assignTableBody = document.getElementById("assignComplaintsList");
    const complaintsRef = ref(db, "complaints");

    onValue(complaintsRef, (snapshot) => {
        if (!assignTableBody) return;
        assignTableBody.innerHTML = "";
        
        if (!snapshot.exists()) {
            assignTableBody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>No new complaints</td></tr>";
            return;
        }

        snapshot.forEach((studentSnap) => {
            const studentUID = studentSnap.key;
            const studentInfo = allUsersData[studentUID] || {};
            const studentDept = studentInfo.department || "N/A";

            studentSnap.forEach((complaintSnap) => {
                const comp = complaintSnap.val();
                const compId = complaintSnap.key;

                // --- Professional Grouping Logic ---
                let organizedTeachers = {};
                for (let tUid in teachersData) {
                    const t = teachersData[tUid];
                    if (!organizedTeachers[t.dept]) organizedTeachers[t.dept] = [];
                    organizedTeachers[t.dept].push({ uid: tUid, ...t });
                }

                let teacherOptions = `<option value="">Select Staff</option>`;
                for (let deptName in organizedTeachers) {
                    // Department ki heading (Category)
                    teacherOptions += `<optgroup label="--- ${deptName.toUpperCase()} ---">`;
                    
                    organizedTeachers[deptName].forEach(staff => {
                        let isSelected = comp.assignedTo === staff.uid ? "selected" : "";
                        teacherOptions += `<option value="${staff.uid}" ${isSelected}>${staff.name} (${staff.role})</option>`;
                    });
                    
                    teacherOptions += `</optgroup>`;
                }
                // --- End of Grouping Logic ---

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${compId}</td>
                    <td style="font-weight: bold; color: #115562;">${studentDept}</td>
                    <td><span class="badge-${(comp.priority || 'low').toLowerCase()}">${comp.priority || "Low"}</span></td>
                    <td>${comp.title || "No Title"}</td>
                    <td>
                        <select id="dropdown-${compId}" class="assign-select" style="padding: 5px; border-radius: 4px; width: 100%;">
                            ${teacherOptions}
                        </select>
                    </td>
                    <td>
                        <button class="btn-approve" onclick="confirmAssign('${studentUID}', '${compId}')">Confirm</button>
                    </td>`;
                assignTableBody.appendChild(tr);
            });
        });
    });
}

// window.confirmAssign = function(studentUID, compId) {
//     const selectBox = document.getElementById(`dropdown-${compId}`);
//     const selectedTeacherUID = selectBox.value;
    
//     // Naya tareeka teacher ka naam uthane ka dropdown se
//     const selectedTeacherName = selectBox.options[selectBox.selectedIndex].text;

//     if (!selectedTeacherUID) { 
//         alert("Please select a teacher!"); 
//         return; 
//     }

//     // Firebase update logic
//     update(ref(db, `complaints/${studentUID}/${compId}`), {
//         assignedTo: selectedTeacherUID,
//         assignedToName: selectedTeacherName, // Ab sahi naam save hoga
//         status: "In Progress"
//     }).then(() => {
//         // Notification bhejain
//         push(ref(db, `notifications/${studentUID}`), {
//             title: "Complaint Assigned",
//             message: `Your complaint ${compId} has been assigned to ${selectedTeacherName}.`,
//             timestamp: Date.now(), 
//             read: false
//         });
        
//         alert("Assigned Successfully! ✅");
//     }).catch((error) => {
//         console.error("Update Error:", error);
//         alert("Error: Assignment failed.");
//     });
// };

window.confirmAssign = function(studentUID, compId) {
    const selectBox = document.getElementById(`dropdown-${compId}`);
    const selectedTeacherUID = selectBox.value;
    const selectedTeacherName = selectBox.options[selectBox.selectedIndex].text;

    if (!selectedTeacherUID) { 
        alert("Please select a teacher!"); 
        return; 
    }

    // 1. Firebase Update Logic (Complaint update karna)
    update(ref(db, `complaints/${studentUID}/${compId}`), {
        assignedTo: selectedTeacherUID,
        assignedToName: selectedTeacherName,
        status: "In Progress"
    }).then(() => {
        
        // --- 2. Notification for STUDENT ---
        push(ref(db, `notifications/${studentUID}`), {
            title: "Complaint Assigned",
            message: `Your complaint ${compId} has been assigned to ${selectedTeacherName}.`,
            timestamp: Date.now(), 
            read: false
        });

        // --- 3. Notification for TEACHER (Yeh humne add kiya hai) ---
        push(ref(db, `notifications/${selectedTeacherUID}`), {
            title: "New Task Assigned",
            message: `Admin has assigned you a new complaint (ID: ${compId}). Please check your dashboard.`,
            timestamp: Date.now(),
            read: false
        });
        
        alert("Assigned Successfully & Notification Sent to Teacher! ✅");
    }).catch((error) => {
        console.error("Update Error:", error);
        alert("Error: Assignment failed.");
    });
};


// // ================= PERFORMANCE ANALYTICS =================
function calculateRating(solved, pending) {
    if (solved === 0 && pending === 0) return "0.0"; 
    let baseRating = 3.0; 
    let bonus = solved * 0.5; // Zayda solve karne par rating barhay gi
    let penalty = pending * 0.2; 
    let finalScore = baseRating + bonus - penalty;
    return Math.min(5.0, Math.max(1.0, finalScore)).toFixed(1);
}


window.fetchPerformanceData = function() {
    console.log("Analytics Loading...");
    const complaintsRef = ref(db, "complaints");

    onValue(complaintsRef, (snapshot) => {
        let stats = {}; 
        let totalResolved = 0;

        if (snapshot.exists()) {
            snapshot.forEach((studentSnap) => {
                studentSnap.forEach((complaintSnap) => {
                    const comp = complaintSnap.val();
                    const teacher = comp.assignedToName || "Unassigned";

                    if (!stats[teacher]) stats[teacher] = { resolved: 0, pending: 0 };

                    if (comp.status === "Resolved") {
                        stats[teacher].resolved++;
                        totalResolved++;
                    } else {
                        stats[teacher].pending++;
                    }
                });
            });
        }

        // --- TOP PERFORMER & SORTING LOGIC ---
        // Stats ko array mein convert karke sort kar rahe hain
        let sortedStaff = Object.keys(stats).map(name => ({
            name: name,
            resolved: stats[name].resolved,
            pending: stats[name].pending
        })).sort((a, b) => b.resolved - a.resolved);

        // UI Updates (Cards)
        const totalText = document.getElementById('totalResolvedText');
        const topTeacherDisplay = document.getElementById('topTeacherText'); 
        
        if(totalText) totalText.innerText = totalResolved;
        if(topTeacherDisplay) {
            topTeacherDisplay.innerText = sortedStaff.length > 0 ? sortedStaff[0].name : "--";
        }
        
        // Final function call jo table aur graph dono banaye ga
        updatePerformanceUI(sortedStaff);
        
    }, { onlyOnce: true });
};

function updatePerformanceUI(sortedStaff) {
    const tableBody = document.getElementById("performanceBody");
    const labels = [];
    const dataPoints = [];
    
    if (tableBody) tableBody.innerHTML = "";
    
    // Sorted data par loop chala kar Table aur Graph ke liye data tayyar karna
    sortedStaff.forEach((teacher, index) => {
        // Graph ke liye data
        labels.push(teacher.name);
        dataPoints.push(teacher.resolved);

        // Table ke liye rows
        if (tableBody) {
            let currentRating = calculateRating(teacher.resolved, teacher.pending);
            let rank = index + 1;

            tableBody.innerHTML += `
                <tr>
                    <td>${rank}</td>
                    <td>${teacher.name}</td>
                    <td>${teacher.resolved}</td>
                    <td>${teacher.pending}</td>
                    <td>${currentRating} <i class="fas fa-star avg-rating-star"></i></td>
                </tr>`;
        }
    });

    // --- GRAPH SECTION (Fixed) ---
    const ctx = document.getElementById('performanceChart')?.getContext('2d');
    if (!ctx) {
        console.error("Canvas element not found!");
        return;
    }

    // Purana chart destroy karein taake naya render ho sake
    if (performanceChartInstance) {
        performanceChartInstance.destroy();
    }

    performanceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels, // Sorted Names
            datasets: [{ 
                label: 'Resolved Complaints', 
                data: dataPoints, // Sorted Values
                backgroundColor: '#4e73df',
                borderRadius: 5
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}


// ================= USER MANAGEMENT =================
const userTableBody = document.getElementById("all-users-list");

function loadUsers() {
    onValue(ref(db, "users"), (snapshot) => {
        if (!userTableBody) return;
        userTableBody.innerHTML = "";
        const users = snapshot.val();
        
        for (let uid in users) {
            const u = users[uid];
            const tr = document.createElement("tr");
            
            // Yahan Reset button add kar diya gaya hai
            tr.innerHTML = `
                <td><span class="status status-${u.role}">${u.role || "-"}</span></td>
                <td>${u.firstName || "-"}</td>
                <td>${u.email || "-"}</td>
                <td><span class="status-approved">${u.status || "Active"}</span></td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-edit" onclick="window.openUserModal('${uid}', '${u.firstName}', '${u.role}')">Edit</button>
                        <button class="btn-reset" style="background-color: #f39c12; color: white; border:none; padding: 5px 10px; border-radius:4px; cursor:pointer;" onclick="window.sendResetEmail('${u.email}')">Reset</button>
                        <button class="btn-delete" onclick="window.deleteUser('${uid}')">Delete</button>
                    </div>
                </td>`;
            userTableBody.appendChild(tr);
        }
    }); // removed {onlyOnce: true} taake updates live dikhein
}

window.deleteUser = function(uid) {
    if(confirm("Delete user?")) remove(ref(db, `users/${uid}`)).then(() => loadUsers());
};

// ================= STUDENT FEEDBACK =================
const feedbackRef = ref(db, "feedback");
onValue(feedbackRef, (snapshot) => {
    const feedbackList = document.getElementById("feedback-list");
    const feedbackBadge = document.getElementById("feedback-count");
    if (!feedbackList) return;
    feedbackList.innerHTML = "";
    let newCount = 0;
    const data = snapshot.val();
    if (!data) { feedbackBadge.innerText = "0"; return; }
    for (let sid in data) {
        for (let fid in data[sid]) {
            const f = data[sid][fid];
            if (f.status === "new") newCount++;
            feedbackList.innerHTML += `<tr><td>${sid}</td><td>${f.feedback}</td><td><button onclick="markFeedbackRead('${sid}','${fid}')">Remove</button></td></tr>`;
        }
    }
    feedbackBadge.innerText = newCount;
});

window.markFeedbackRead = function (sid, fid) {
    remove(ref(db, `feedback/${sid}/${fid}`));
};

// ================= LOGOUT =================
document.getElementById("logoutBtn")?.addEventListener("click", () => {
    signOut(auth).then(() => {
        alert("Logged out ");
        window.location.href = "login.html";
    });
});


function updateComplaintBadge() {
    const badge = document.getElementById("complaint-count");
    const complaintsRef = ref(db, "complaints");

    onValue(complaintsRef, (snapshot) => {
        let count = 0;
        if (snapshot.exists()) {
            snapshot.forEach((studentSnap) => {
                studentSnap.forEach((complaintSnap) => {
                    const comp = complaintSnap.val();
                    
                    if (!comp.assignedTo || comp.status === "Pending") {
                        count++;
                    }
                });
            });
        }

        if (badge) {
            badge.innerText = count;
            // Agar count 0 se zyada hai to dikhao, warna chupa do
            badge.style.display = count > 0 ? "inline-block" : "none";
        }
    });
}
updateComplaintBadge();


// ================= USER MANAGEMENT =================
// This function opens the modal and fills it with user data
window.openUserModal = function(uid, name, role) {
    console.log("Opening modal for:", name); // For debugging
    
    currentEditingUid = uid; // Save the UID globally
    
    const modal = document.getElementById("editUserModal");
    const nameField = document.getElementById("editUserName");
    const roleField = document.getElementById("editUserRole");

    if (modal && nameField && roleField) {
        nameField.value = name;
        roleField.value = role;
        modal.style.display = "flex"; // Show the modal
    } else {
        alert("Error: Modal elements not found in HTML!");
    }
};
// Function to hide the Edit Modal
window.closeUserModal = function() {
    const modal = document.getElementById("editUserModal");
    if (modal) {
        modal.style.display = "none";
    }
};

// Also add a function to close the modal
window.closeUserModal = function() {
    document.getElementById("editUserModal").style.display = "none";
};
// Edit button
window.saveUserChanges = function() {
    if (!currentEditingUid) return;

    const newName = document.getElementById("editUserName").value;
    const newRole = document.getElementById("editUserRole").value;

    update(ref(db, `users/${currentEditingUid}`), {
        firstName: newName,
        role: newRole
    }).then(() => {
        alert("User details updated successfully! ✅");
        document.getElementById("editUserModal").style.display = "none";
    }).catch((error) => {
        alert("Update failed: " + error.message);
    });
};

// Attach the save function to your Modal's "Save" button
document.getElementById("saveUserBtn")?.addEventListener("click", window.saveUserChanges);


window.deleteUser = function(uid) {
    if (confirm("Are you sure you want to delete this user?")) {
        remove(ref(db, `users/${uid}`))
            .then(() => alert("User deleted successfully!"))
            .catch(err => alert("Error: " + err.message));
    }
};


// --- 1. Reset Password Email ---
// import { getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// Global window function
window.sendResetEmail = function(email) {
    const auth = getAuth(); // Ensure auth is initialized
    
    if (!email) {
        alert("Email not found!");
        return;
    }

    sendPasswordResetEmail(auth, email)
        .then(() => {
            alert("Password reset email sent! Please check your inbox (and spam folder).");
        })
        .catch((error) => {
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            alert("Error: " + error.message);
        });
};
// ================= SEARCH FILTER LOGIC =================

document.getElementById("userSearch")?.addEventListener("keyup", function() {
    const filter = this.value.toLowerCase(); // What the admin is typing
    const table = document.getElementById("userTable");
    const tr = table.getElementsByTagName("tr");

    // Loop through all table rows (starting from index 1 to skip the header)
    for (let i = 1; i < tr.length; i++) {
        const row = tr[i];
        // Get text content from Role, Name, and Email columns
        const roleText = row.cells[0].textContent.toLowerCase();
        const nameText = row.cells[1].textContent.toLowerCase();
        const emailText = row.cells[2].textContent.toLowerCase();

        // If the typed text exists in any of these columns, show the row
        if (roleText.includes(filter) || nameText.includes(filter) || emailText.includes(filter)) {
            row.style.display = ""; // Show
        } else {
            row.style.display = "none"; // Hide
        }
    }
});
document.addEventListener("DOMContentLoaded", function() {
    // 1. Dashboard Overview section ko show karein
    const dashboardSection = document.getElementById('dashboardOverview');
    if (dashboardSection) {
        dashboardSection.style.display = 'block';
    }

    // 2. Sidebar mein Dashboard link ko 'active' color dein
    const dashboardLink = document.querySelector('.sidebar ul li a[onclick*="dashboardOverview"]');
    if (dashboardLink) {
        dashboardLink.classList.add('active');
    }
});


// 1. Firebase Initialization (Check karein ke config details pehle se hain)
// Dashboard Statistics link karne ka function
function updateDashboardStats() {
    const usersRef = ref(db, "users");
    const complaintsRef = ref(db, "complaints");

    // Users stats (Total & Pending)
    onValue(usersRef, (snapshot) => {
        let total = 0;
        let pending = 0;
        snapshot.forEach((child) => {
            const user = child.val();
            total++;
            if (user.role === "teacher" && user.status === "pending") {
                pending++;
            }
        });
        if(document.getElementById('stat-total-users')) 
            document.getElementById('stat-total-users').innerText = total;
        if(document.getElementById('stat-pending-approvals')) 
            document.getElementById('stat-pending-approvals').innerText = pending;
    });

    // Complaints stats (Active & Resolved)
    onValue(complaintsRef, (snapshot) => {
        let active = 0;
        let resolved = 0;
        snapshot.forEach((studentSnap) => {
            studentSnap.forEach((complaintSnap) => {
                const comp = complaintSnap.val();
                if (comp.status === "Resolved") resolved++;
                else active++;
            });
        });
        if(document.getElementById('stat-active-complaints')) 
            document.getElementById('stat-active-complaints').innerText = active;
        if(document.getElementById('stat-resolved-complaints')) 
            document.getElementById('stat-resolved-complaints').innerText = resolved;
    });
}



document.addEventListener("DOMContentLoaded", function() {
    updateDashboardStats(); 
    renderDashboardCharts();
});
function renderDashboardCharts() {
    const usersRef = ref(db, "users");
    const complaintsRef = ref(db, "complaints");

    // --- 1. User Distribution Chart (Pie) ---
    onValue(usersRef, (snapshot) => {
        let counts = { student: 0, teacher: 0, admin: 0 };
        snapshot.forEach(child => {
            const role = child.val().role;
            if (counts[role] !== undefined) counts[role]++;
        });

        new Chart(document.getElementById('userDistChart'), {
            type: 'doughnut',
            data: {
                labels: ['Students', 'Staff/Teachers', 'Admins'],
                datasets: [{
                    data: [counts.student, counts.teacher, counts.admin],
                    backgroundColor: ['#4e73df', '#f6c23e', '#1cc88a'],
                    hoverOffset: 4
                }]
            },
            options: { responsive: true }
        });
    });

    // --- 2. Complaint Priority Chart (Bar) ---
    onValue(complaintsRef, (snapshot) => {
        let priorityStats = { High: 0, Medium: 0, Low: 0 };
        snapshot.forEach(studentSnap => {
            studentSnap.forEach(compSnap => {
                const p = compSnap.val().priority || "Low";
                if (priorityStats[p] !== undefined) priorityStats[p]++;
            });
        });

        new Chart(document.getElementById('complaintTrendChart'), {
            type: 'bar',
            data: {
                labels: ['High', 'Medium', 'Low'],
                datasets: [{
                    label: 'No. of Complaints',
                    data: [priorityStats.High, priorityStats.Medium, priorityStats.Low],
                    backgroundColor: ['#e74a3b', '#f6c23e', '#4e73df'],
                    borderRadius: 5
                }]
            },
            options: { 
                responsive: true,
                scales: { y: { beginAtZero: true } }
            }
        });
    });
}