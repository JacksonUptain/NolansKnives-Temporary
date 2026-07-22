import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAr341b5_CQxZHQg3ZEZDTaMYVYh14v8i8",
  authDomain: "nolansknives.firebaseapp.com",
  databaseURL: "https://nolansknives-default-rtdb.firebaseio.com",
  projectId: "nolansknives",
  storageBucket: "nolansknives.firebasestorage.app",
  messagingSenderId: "233692313709",
  appId: "1:233692313709:web:3e37d30d821cfed718e764",
  measurementId: "G-0G3HMYE8QC"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getDatabase(app);
export const functions = getFunctions(app, "us-central1");
export const storage = getStorage(app);