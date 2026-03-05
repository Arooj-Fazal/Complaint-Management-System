// ===== Import Firebase modules =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// ===== Firebase config =====
const firebaseConfig = {
    apiKey: "AIzaSyCiQJk-1hhGyK4rnUvNIKEnDE35IGTflas",
    authDomain: "complaintmanagementsyste-9c5f8.firebaseapp.com",
    databaseURL: "https://complaintmanagementsyste-9c5f8-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "complaintmanagementsyste-9c5f8",
    storageBucket: "complaintmanagementsyste-9c5f8.appspot.com",
    messagingSenderId: "735335276952",
    appId: "1:735335276952:web:450a5472f47076c42c4bed",
    measurementId: "G-TEMZ7Q32QG"
};

// ===== Initialize Firebase =====
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ===== Show popup / error message function =====
function showNotification(message, type = "error", duration = 4000) {
    const notification = document.getElementById("errorMessage");
    if (!notification) return;

    notification.textContent = message;
    notification.style.display = "block";
    notification.style.color = type === "success" ? "green" : "red";

    setTimeout(() => {
        notification.style.display = "none";
    }, duration);
}

// ===== Login functionality =====
document.querySelector(".login-btn").addEventListener("click", function(e) {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    if (!email || !password) {
        showNotification("Please enter email and password!");
        return;
    }

    signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
        const user = userCredential.user;

        // ===== Fetch user data from Realtime Database =====
        const userRef = ref(db, "users/" + user.uid);
        get(userRef)
        .then((snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const role = data.role ? data.role.toString().trim().toLowerCase() : "";
                const status = data.status ? data.status.toString().trim().toLowerCase() : "";

                if (status === "approved") {
                    //  Approved: allow login
                    showNotification(`Login Successful! Role: ${role}`, "success", 3000);

                    setTimeout(() => {
                        // Redirect based on role
                        switch(role) {
                            case "teacher":
                                window.location.href = "teacherDashboard.html";
                                break;
                            case "hod":
                                window.location.href = "hodDashboard.html";
                                break;
                            case "dean":
                                window.location.href = "deanDashboard.html";
                                break;
                            case "vc":
                                window.location.href = "vcDashboard.html";
                                break;
                            case "student":
                                window.location.href = "studentDashboard.html";
                                break;
                            case "admin":  // ✅ Admin redirect
                                window.location.href = "adminDashboard.html";
                               break;
                            default:
                                window.location.href = "dashboard.html";
                        }
                    }, 3000);

                } else if (status === "pending") {
                    // ⚠ Pending: block login
                    showNotification("❌ Your account is under review. You cannot login yet.", "error", 5000);
                    auth.signOut();

                } else {
                    showNotification("❌ Your account is not approved.", "error", 5000);
                    auth.signOut();
                }

            } else {
                showNotification("❌ User data not found!", "error", 4000);
                auth.signOut();
            }
        })
        .catch((error) => {
            showNotification("❌ Database error: " + error.message, "error", 5000);
        });

    })
    .catch((error) => {
        switch (error.code) {
            case "auth/wrong-password":
                showNotification("❌ Incorrect Password!");
                break;
            case "auth/user-not-found":
                showNotification("❌ User does not exist!");
                break;
            case "auth/invalid-email":
                showNotification("❌ Invalid Email!");
                break;
            default:
                showNotification("❌ " + error.message);
        }
    });
});

// ===== Forgot Password functionality =====
document.querySelector(".forgot-password a").addEventListener("click", function(e) {
    e.preventDefault();

    const email = prompt("Enter your registered email for password reset:");
    if (!email) {
        showNotification("Please enter an email!", "error");
        return;
    }

    sendPasswordResetEmail(auth, email)
    .then(() => {
        showNotification("✅ Password reset link sent to your email!", "success", 5000);
    })
    .catch((error) => {
        showNotification("❌ " + error.message, "error", 5000);
    });
});

const togglePassword = document.querySelector('#togglePassword');
const passwordField = document.querySelector('#loginPassword');

togglePassword.addEventListener('click', function () {
    // Password type check karein (text ya password)
    const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordField.setAttribute('type', type);
    
    // Icon badalne ke liye (eye se eye-slash)
    this.classList.toggle('fa-eye-slash');
});