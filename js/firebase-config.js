// ============================================================
// PropOS — Firebase Configuration
// Project: propos-app-55227
// ============================================================

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD3OPM5yvPUBQYTMJ2DikAJ-1p6AzESwa4",
  authDomain:        "propos-app-55227.firebaseapp.com",
  projectId:         "propos-app-55227",
  storageBucket:     "propos-app-55227.firebasestorage.app",
  messagingSenderId: "346336141691",
  appId:             "1:346336141691:web:7febd90503ddae183c1dde"
};

// ============================================================
// Firebase Initialization
// ============================================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage }     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseApp = initializeApp(FIREBASE_CONFIG);

export const auth    = getAuth(firebaseApp);
export const db      = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

export default firebaseApp;
