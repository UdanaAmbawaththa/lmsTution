/**
 * Firebase Configuration for Tuition LMS
 * -------------------------------------
 * Connected to Firebase Project: tution-lms-cae5a
 *
 * Setup checklist in Firebase Console (https://console.firebase.google.com/project/tution-lms-cae5a):
 * 1. Authentication -> Sign-in method -> Enable "Email/Password".
 * 2. Authentication -> Users -> Add users:
 *    - Admin users:   Any email listed in ADMIN_EMAILS below
 *    - Student users: Any other user created in Firebase Authentication -> Users
 * 3. Firestore Database -> Create database -> Publish rules from firestore.rules.
 * 4. Storage -> Get started (if uploading PDF files directly) -> Publish rules from storage.rules.
 * 5. Serve over http://localhost or https:// (e.g. GitHub Pages / Firebase Hosting) for Firebase Auth.
 */

window.TuitionLMS = window.TuitionLMS || {};

window.TuitionLMS.FIREBASE_CONFIG = {
    apiKey: "AIzaSyCzVvt_8XSL1W81QiWDOKdBTq3GoMIyKbE",
    authDomain: "tution-lms-cae5a.firebaseapp.com",
    databaseURL: "https://tution-lms-cae5a-default-rtdb.firebaseio.com",
    projectId: "tution-lms-cae5a",
    storageBucket: "tution-lms-cae5a.firebasestorage.app",
    messagingSenderId: "132793994014",
    appId: "1:132793994014:web:6891e519cf66ee84eb970f"
};

/**
 * Role mapping for Firebase Authentication:
 * - ADMIN_EMAILS: Users allowed to access BOTH Admin Panel & Student Panel.
 * - Any other authenticated Firebase user is treated as a Student.
 */
window.TuitionLMS.AUTH_ROLES = {
    ADMIN_EMAILS: [
        "admin@tuition.lms",
        "udana123@gmail.com"
    ]
};

/**
 * Local fallback defaults (used only if FIREBASE_CONFIG is reverted to placeholders).
 */
window.TuitionLMS.DEMO_CONFIG = {
    ADMIN_EMAIL: "admin@tuition.lms",
    ADMIN_PASS: "admin123",
    STUDENT_PASS: "student123"
};

window.TuitionLMS.isFirebaseConfigured = function isFirebaseConfigured() {
    const cfg = window.TuitionLMS.FIREBASE_CONFIG;
    return Boolean(
        cfg.apiKey &&
        cfg.apiKey !== "YOUR_API_KEY" &&
        cfg.projectId &&
        cfg.projectId !== "YOUR_PROJECT_ID"
    );
};