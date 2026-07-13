import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  getFirestore, 
  enableIndexedDbPersistence
} from "firebase/firestore";

// Your web app's Firebase configuration
// Ensure you create a .env.local file with these variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "dummy-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dummy.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dummy-project",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "dummy.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:000:web:000"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db)
  .catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn("Multiple tabs open, persistence can only be enabled in one tab at a a time.");
    } else if (err.code == 'unimplemented') {
      console.warn("The current browser does not support all of the features required to enable persistence");
    }
  });
