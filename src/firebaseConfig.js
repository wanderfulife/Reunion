import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
	apiKey: "AIzaSyCWo7SF_8g83QqKS7p_Fa-DJqH9QSRajTE",
	authDomain: "reunion-362e4.firebaseapp.com",
	projectId: "reunion-362e4",
	storageBucket: "reunion-362e4.appspot.com",
	messagingSenderId: "702774440222",
	appId: "1:702774440222:web:c589d7b7d43440ecf9590f",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
