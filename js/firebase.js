import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const medirDashboardFirebase = window.location.pathname.endsWith("/dashboard.html") || window.location.pathname.endsWith("dashboard.html");

if (medirDashboardFirebase) {
  performance.mark?.("cognicion:firebase:init:start");
  console.time?.("COGNICION dashboard | Firebase init");
}

const firebaseConfig = {
  apiKey: "AIzaSyC9eSx4-5wvNebk2pXFT8dcuRbJqJe9Qp4",
  authDomain: "cognicion-57052.firebaseapp.com",
  projectId: "cognicion-57052",
  storageBucket: "cognicion-57052.firebasestorage.app",
  messagingSenderId: "1037684177162",
  appId: "1:1037684177162:web:537b09233b83f3e9b422f3"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");

if (medirDashboardFirebase) {
  performance.mark?.("cognicion:firebase:init:end");
  performance.measure?.("COGNICION dashboard | Firebase init", "cognicion:firebase:init:start", "cognicion:firebase:init:end");
  console.timeEnd?.("COGNICION dashboard | Firebase init");
}
