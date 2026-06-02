/* =============================================
   ARCHIVE & HISTORY — archive.js
   Firebase Firestore Integration
   ============================================= */

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

// ── Firebase Init ──────────────────────────────
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
