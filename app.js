// ===== Import Firebase modules =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

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
const auth = getAuth();
const db = getDatabase();

function showNotification(message, duration = 4000) { 
    const notification = document.getElementById("notification");
    if (!notification) return;
    notification.innerText = message;
    notification.style.display = "block";
    setTimeout(() => { notification.style.display = "none"; }, duration);
}

// ===== Form submission =====
document.getElementById("registerForm").addEventListener("submit", function(e) {
    e.preventDefault();

    let firstName = document.getElementById("firstName").value.trim();
    let lastName = document.getElementById("lastName").value.trim();
    let email = document.getElementById("email").value.trim();
    let universityId = document.getElementById("universityId").value.trim(); 
    let role = document.getElementById("role").value;
    let department = document.getElementById("department").value; 
    let password = document.getElementById("password").value;
    let confirmPassword = document.getElementById("confirmPassword").value;
    let msg = document.getElementById("msg");

    if (!firstName || !lastName || !email || !password || !confirmPassword || !role || !universityId || !department) {
        msg.innerHTML = "All fields are required!";
        msg.style.color = "red";
        return;
    }

    if (password !== confirmPassword) {
        msg.innerHTML = "Passwords do not match!";
        msg.style.color = "red";
        return;
    }

    // Gmail validation
    const gmailPattern = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!gmailPattern.test(email)) {
        msg.innerHTML = "Email must end with @gmail.com!";
        msg.style.color = "red";
        return;
    }

    // ===== DUPLICATE ID CHECK =====
    msg.innerHTML = "Checking ID...";
    msg.style.color = "blue";

    get(ref(db, "users")).then((snapshot) => {
        let idExists = false;
        
        if (snapshot.exists()) {
            const data = snapshot.val();
            // Check if ID is already used
            for (let uid in data) {
                if (data[uid].universityId === universityId) {
                    idExists = true;
                    break;
                }
            }
        }

        if (idExists) {
            msg.innerHTML = "University ID already exists!";
            msg.style.color = "red";
        } else {
            // Proceed with Registration
            createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                const user = userCredential.user;
                let status = (role.toLowerCase() === "student") ? "approved" : "pending";

                set(ref(db, "users/" + user.uid), {
                    firstName, lastName, email, universityId, role, department, status
                })
                .then(() => {
                    if (status === "approved") {
                        showNotification("Registered successfully!", 4000);
                        setTimeout(() => { window.location.href = "login.html"; }, 4000);
                    } else {
                        showNotification(`Your registration as ${role} is under review.`, 4000);
                        document.getElementById("registerForm").reset();
                        msg.innerHTML = "Sent for Admin approval.";
                        msg.style.color = "green";
                    }
                });
            })
            .catch((error) => {
                msg.innerHTML = error.message;
                msg.style.color = "red";
            });
        }
    }).catch((error) => {
        // Agar database rules ka masla ho tab ye chaly ga
        msg.innerHTML = "Database Error: Please check your Firebase Rules.";
        msg.style.color = "red";
        console.error(error);
    });
});