import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue, update, onChildChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
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
const storage = getStorage(app);

// ===== Sections =====
const sections = {
    overview: document.getElementById('overviewSection'),
    submit: document.getElementById('submitComplaintSection'),
    view: document.getElementById('viewComplaintsSection'),
    profile: document.getElementById('profileSection'),
    feedback: document.getElementById('feedbackSection'),
    notifications: document.getElementById('notificationsSection'),
    editComplaints: document.getElementById('editComplaintsSection'),
    editForm: document.getElementById('editFormSection')
};

// ===== Show/Hide Sections =====
function hideAllSections() { Object.values(sections).forEach(sec => sec ? sec.style.display = 'none' : null); }
function showSection(key) { hideAllSections(); if (sections[key]) sections[key].style.display = 'block'; }

// ===== Format Timestamp =====
function formatTimestamp(ms) {
    const d = new Date(ms);
    return `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}

// ===== Generate Complaint ID =====
function generateComplaintID() {
    const d = new Date();
    return `CMP-${d.getFullYear()}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getDate().toString().padStart(2,'0')}-${d.getHours().toString().padStart(2,'0')}${d.getMinutes().toString().padStart(2,'0')}${d.getSeconds().toString().padStart(2,'0')}`;
}

// ===== Detect Priority =====
function detectPriority(text) {
    text = text.toLowerCase();
    if (["urgent","emergency","harassment","danger","fire","accident","electrical"].some(k => text.includes(k))) return "High";
    if (["delay","issue","problem","not working"].some(k => text.includes(k))) return "Medium";
    return "Low";
}

// ===== Sidebar Links =====
document.getElementById('overviewLink')?.addEventListener('click', e => { e.preventDefault(); showSection('overview'); });
document.getElementById('showComplaintsBtn')?.addEventListener('click', e => { e.preventDefault(); showSection('submit'); });
document.getElementById('sidebarSubmitComplaint')?.addEventListener('click', e => { e.preventDefault(); showSection('submit'); });
document.getElementById('viewComplaintsLink')?.addEventListener('click', e => { e.preventDefault(); showSection('editComplaints'); loadUserComplaints(); });
document.getElementById('profileLink')?.addEventListener('click', e => { e.preventDefault(); showSection('profile'); loadUserProfile(); });
document.getElementById('feedbackLink')?.addEventListener('click', e => { e.preventDefault(); showSection('feedback'); });
document.getElementById('notificationsLink')?.addEventListener('click', e => { e.preventDefault(); showSection('notifications'); loadNotifications(auth.currentUser.uid); });

// ===== Logout =====
document.getElementById('logoutBtn')?.addEventListener('click', e => { e.preventDefault(); signOut(auth).then(() => window.location.href="login.html").catch(err => alert(err.message)); });

// ===== Submit Complaint =====
document.getElementById('complaintForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const title = document.getElementById('complaintTitle').value.trim();
    const description = document.getElementById('complaintDesc').value.trim();
    const category = document.getElementById('complaintCategory').value;
    if(!title || !description || !category) { alert("Fill all fields"); return; }

    const userId = auth.currentUser.uid;
    const priority = detectPriority(title + " " + description);
    const complaintID = generateComplaintID();
    set(ref(db, `complaints/${userId}/${complaintID}`), {
        complaintID, title, description, category, priority,
        status:"Pending", timestamp: Date.now(), studentId:userId
    }).then(() => {
        push(ref(db, `notifications/${userId}`), { title:"Complaint Submitted", message:`Your complaint "${title}" submitted! ID: ${complaintID}`, timestamp:Date.now() });
        const teacherUID = "REPLACE_TEACHER_UID"; 
        push(ref(db, `notifications/${teacherUID}`), { title:"New Complaint", message:`Complaint "${title}" submitted by ${auth.currentUser.email}. ID: ${complaintID}`, timestamp:Date.now() });
        alert("Complaint submitted! ID: "+complaintID);
        document.getElementById('complaintForm').reset();
        fetchComplaints();
        loadNotifications(userId);
    }).catch(err => alert(err.message));
});

// ===== Fetch Complaints for Dashboard =====
function fetchComplaints() {
    const userId = auth.currentUser.uid;
    const list = document.getElementById('complaintsList');
    const totalCount = document.getElementById('totalComplaintsCount');
    const pendingCount = document.getElementById('pendingComplaintsCount');
    const resolvedCount = document.getElementById('resolvedComplaintsCount');

    onValue(ref(db, `complaints/${userId}`), snapshot => {
        let total=0, pending=0, resolved=0;
        if(list) list.innerHTML = '';
        snapshot.forEach(child => {
            total++;
            const c = child.val();
            if(c.status === "Pending") pending++;
            if(c.status === "Resolved") resolved++;
            if(list){
                const div = document.createElement('div');
                div.className="complaintCard";
                div.innerHTML = `<h4>${c.title}</h4><p>ID: ${child.key}</p><p>${c.description}</p><p>Category: ${c.category}</p><p>Priority: ${c.priority}</p><p>Status: ${c.status}</p><p>Submitted: ${formatTimestamp(c.timestamp)}</p>`;
                list.appendChild(div);
            }
        });
        if(totalCount) totalCount.textContent = total;
        if(pendingCount) pendingCount.textContent = pending;
        if(resolvedCount) resolvedCount.textContent = resolved;
    });
}


// Sidebar Submit Complaints Button
// Submit Complaints Sidebar
document.getElementById('showComplaintsBtn')?.addEventListener('click', e => {
    e.preventDefault();
    hideAllSections();

    // Show the section that contains the list of complaints
    const viewComplaintsSection = document.getElementById('viewComplaintsSection');
    if(viewComplaintsSection) viewComplaintsSection.style.display = 'block';

    // Load user's submitted complaints into the section
    // loadUserSubmittedComplaints(); 
});
function loadUserSubmittedComplaints(){
    const list = document.getElementById('showComplaintsBtn');
    const userId = auth.currentUser.uid;
    if(!list) return;
    list.innerHTML = ''; // Clear previous

    onValue(ref(db, `complaints/${userId}`), snapshot => {
        if(!snapshot.exists()){ 
            list.innerHTML = "<p>No complaints submitted yet.</p>"; 
            return; 
        }
        snapshot.forEach(child => {
            const c = child.val();
            const div = document.createElement('div');
            div.className = "complaintCard";
            div.innerHTML = `
                <h4>${c.title}</h4>
                <p><strong>ID:</strong> ${child.key}</p>
                <p><strong>Description:</strong> ${c.description}</p>
                <p><strong>Category:</strong> ${c.category}</p>
                <p><strong>Priority:</strong> ${c.priority}</p>
                <p><strong>Status:</strong> ${c.status}</p>
                <p><strong>Submitted:</strong> ${formatTimestamp(c.timestamp)}</p>
            `;
            list.appendChild(div);
        });
    }, { onlyOnce: true });
}

// ===== Load Notifications =====
function loadNotifications(userId){
    const list = document.getElementById("notificationsList");
    const badge = document.getElementById("notificationCount");
//     onValue(ref(db, `notifications/${userId}`), snapshot => {
//         if(!list) return;
//         list.innerHTML = '';
//         let count = 0;
//         snapshot.forEach(child => {
//             const n = child.val();
//             if(n && n.title && n.message){
//                 count++;
//                 const li = document.createElement('li');
//                 li.innerHTML = `<strong>${n.title}</strong><br><small>${n.message}</small>`;
//                 list.appendChild(li);
//             }
//         });
//         badge.textContent = count ? count : '';
//     });
   onValue(ref(db, `notifications/${userId}`), snapshot => {
    if(!list) return;
    list.innerHTML = '';
    let count = 0;

    snapshot.forEach(child => {
        const n = child.val();
        if(n && n.title && n.message){
            count++;
            const li = document.createElement('li');
            li.innerHTML = `<strong>${n.title}</strong><br><small>${n.message}</small>`;
            list.appendChild(li);
        }
    });

    // Badge ko update karne ka behtar tareeqa
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-block'; // Show badge
        } else {
            badge.textContent = '';
            badge.style.display = 'none'; // Hide badge if count is 0
        }
    }
});
}

// ===== Load User Profile =====
function loadUserProfile(){
    const userId = auth.currentUser.uid;
    const tbody = document.querySelector('#profileTable tbody');
    onValue(ref(db, `users/${userId}`), snapshot => {
        const data = snapshot.val() || {};
        tbody.innerHTML = `<tr>
            <td>${data.firstName||''}</td>
            <td>${data.lastName||''}</td>
            <td>${data.email||''}</td>
            <td>${data.password||''}</td>
            <td><button id="editProfileBtn">Edit</button></td>
        </tr>`;
        document.getElementById('editProfileBtn')?.addEventListener('click', ()=>{
            document.getElementById('profileTableSection').style.display='none';
            document.getElementById('editProfileSection').style.display='block';
            document.getElementById('editUserId').value=userId;
            document.getElementById('editFirstName').value=data.firstName||'';
            document.getElementById('editLastName').value=data.lastName||'';
            document.getElementById('editEmail').value=data.email||'';
            document.getElementById('editPassword').value=data.password||'';
        });
    });
}

// ===== Update Profile =====
document.getElementById('editProfileForm')?.addEventListener('submit', e=>{
    e.preventDefault();
    const userId = document.getElementById('editUserId').value;
    const updatedData={
        firstName: document.getElementById('editFirstName').value.trim(),
        lastName: document.getElementById('editLastName').value.trim(),
        email: document.getElementById('editEmail').value.trim(),
        password: document.getElementById('editPassword').value.trim()
    };
    update(ref(db, `users/${userId}`), updatedData)
    .then(()=>{ alert("Profile updated!"); document.getElementById('editProfileSection').style.display='none'; document.getElementById('profileTableSection').style.display='block'; })
    .catch(err=>alert(err.message));
});
document.getElementById('cancelProfileEditBtn')?.addEventListener('click', ()=>{ document.getElementById('editProfileSection').style.display='none'; document.getElementById('profileTableSection').style.display='block'; });

// ===== Feedback =====
document.getElementById('feedbackForm')?.addEventListener('submit', e=>{
    e.preventDefault();
    const text = document.getElementById('feedbackText').value.trim();
    if(!text){ alert("Write feedback!"); return; }
    push(ref(db, `feedback/${auth.currentUser.uid}`), { feedback:text, timestamp:Date.now(), status:"new" })
    .then(()=>{ alert("Feedback submitted!"); document.getElementById('feedbackForm').reset(); })
    .catch(err=>alert(err.message));
});

// ===== Edit Complaints =====
function loadUserComplaints(){
    const tbody = document.querySelector('#complaintsTable tbody');
    onValue(ref(db, `complaints/${auth.currentUser.uid}`), snapshot=>{
        tbody.innerHTML='';
        snapshot.forEach(child=>{
            const c = child.val();
            if(c.status==="Pending"||c.status==="Submitted"){
                const tr=document.createElement('tr');
                tr.innerHTML=`<td>${child.key}</td><td>${c.title}</td><td>${formatTimestamp(c.timestamp)}</td><td>${c.status}</td><td><button onclick="editComplaint('${child.key}')">Edit</button></td>`;
                tbody.appendChild(tr);
            }
        });
    });
}
window.editComplaint = function(key){
    onValue(ref(db, `complaints/${auth.currentUser.uid}/${key}`), snapshot=>{
        const c = snapshot.val();
        showSection('editForm');
        document.getElementById('editComplaintId').value=key;
        document.getElementById('editTitle').value=c.title;
        document.getElementById('editDescription').value=c.description;
        document.getElementById('editCategory').value=c.category;
    }, {onlyOnce:true});
}
window.updateComplaint=function(){
    const key=document.getElementById('editComplaintId').value;
    const title=document.getElementById('editTitle').value.trim();
    const desc=document.getElementById('editDescription').value.trim();
    const cat=document.getElementById('editCategory').value.trim();
    if(!title||!desc||!cat){ alert("Fill all fields"); return; }
    update(ref(db, `complaints/${auth.currentUser.uid}/${key}`), { title, description:desc, category:cat })
    .then(()=>{ alert("Complaint updated!"); showSection('editComplaints'); loadUserComplaints(); })
    .catch(err=>alert(err.message));
}
document.getElementById('cancelEditBtn')?.addEventListener('click', ()=>{ showSection('editComplaints'); loadUserComplaints(); });





// ===== Auth State =====
// onAuthStateChanged(auth, user=>{
//     if(user){
//         showSection('overview');
//         fetchComplaints();
//         loadNotifications(user.uid);
//     } else window.location.href="login.html";
// });

// 1. Auth Change Listener (Sabse pehle ye check karega login hai ya nahi)
// =============================
//  AUTH STATE & USER INFO
// =============================
onAuthStateChanged(auth, user => {
    if (user) {
        const userId = user.uid;

        // --- NAME AUR PROFILE INFO FETCH KARNA ---
        const userRef = ref(db, `users/${userId}`);
        onValue(userRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // 1. Welcome Name 
                const welcomeName = document.getElementById('welcomeName');
                const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                
                if (welcomeName) {
                    welcomeName.innerText = `Welcome, ${fullName || 'Student'}`;
                }

                // 2. Profile Section Names (Agar aapne table ya sidebar mein rakha hai)
                const nameDisplay = document.getElementById('displayStudentName');
                if (nameDisplay) {
                    nameDisplay.innerText = fullName;
                }

                // 3. Email Display
                const emailDisplay = document.getElementById('displayEmail');
                if (emailDisplay) {
                    emailDisplay.innerText = data.email || user.email;
                }
            }
        });

        // --- DASHBOARD INITIALIZATION ---
        showSection('overview'); // Overview section show karein
        fetchComplaints();       // Complaints load karein
        loadNotifications(userId); // Notifications load karein
        
    } else {
        // Agar logout hai to home ya login par bhejein
        window.location.href = "login.html";
    }
});




