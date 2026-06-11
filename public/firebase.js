import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 🔧 REPLACE THESE WITH YOUR FIREBASE PROJECT CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyCdM2JkifxqqaUJ6Hjp1tu_qwrqMGnSDPs",
  authDomain: "habitflow-123.firebaseapp.com",
  databaseURL: "https://habitflow-123-default-rtdb.firebaseio.com",
  projectId: "habitflow-123",
  storageBucket: "habitflow-123.firebasestorage.app",
  messagingSenderId: "845022688475",
  appId: "1:845022688475:web:1ae781372b53236e8e08fe",
  measurementId: "G-T7C9BKTVBS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Auth instance — handles login/signup/logout
export const auth = getAuth(app);

// Firestore instance — handles all data storage
export const db = getFirestore(app);

// Google provider — for "Sign in with Google"
export const googleProvider = new GoogleAuthProvider();