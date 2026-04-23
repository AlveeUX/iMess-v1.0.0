import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCLPsWVSZVsExAeFDftkVkkzg9HnQlft-8",
  authDomain: "mess-management-f00fc.firebaseapp.com",
  projectId: "mess-management-f00fc",
  storageBucket: "mess-management-f00fc.firebasestorage.app",
  messagingSenderId: "1068921163270",
  appId: "1:1068921163270:web:0beb8fc91419ba24ee3d87"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);