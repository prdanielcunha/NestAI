import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { ReCaptchaEnterpriseProvider, getToken as getAppCheckTokenRaw, initializeAppCheck, type AppCheck } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyAhXY8TV8qoXz8Pd2u5jFHUTVssZmi3kMs",
  authDomain: "millionsnest.firebaseapp.com",
  projectId: "millionsnest",
  storageBucket: "millionsnest.firebasestorage.app",
  messagingSenderId: "555464791734",
  appId: "1:555464791734:web:3059e8ac2b8089a1767817",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

let appCheck: AppCheck | null = null;
const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
if (siteKey) {
  appCheck = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const appCheckConfigured = Boolean(appCheck);

export function watchUser(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function signIn(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutConsole(): Promise<void> {
  await signOut(auth);
}

export async function firebaseIdToken(): Promise<string> {
  if (!auth.currentUser) throw new Error("CONSOLE_NOT_AUTHENTICATED");
  return auth.currentUser.getIdToken();
}

export async function appCheckToken(): Promise<string> {
  if (!appCheck) throw new Error("CONSOLE_APP_CHECK_NOT_CONFIGURED");
  const result = await getAppCheckTokenRaw(appCheck, false);
  return result.token;
}
