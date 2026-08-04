import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  updateProfile
} from "firebase/auth";
import { get, ref, serverTimestamp, update } from "firebase/database";
import { auth, db } from "../pages/firebase";
import { createImpersonationSession } from "../services/impersonationService";
import { syncMyRoleClaims } from "../services/adminService";
import { ROLES, STATUS, isActiveStatus } from "./roleHelpers";

const AuthContext = createContext(null);
const IMPERSONATION_SESSION_KEY = "nk.impersonationSession";

function friendlyAuthError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential")) return "Incorrect email or password.";
  if (code.includes("email-already-in-use")) return "An account with that email already exists.";
  if (code.includes("weak-password")) return "Use a stronger password with at least 6 characters.";
  if (code.includes("popup-closed-by-user")) return "Google sign-in was cancelled.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please wait and try again.";
  return error?.message || "Authentication failed. Please try again.";
}

async function upsertUserProfile(firebaseUser, fallbackDisplayName = "") {
  const userRef = ref(db, `users/${firebaseUser.uid}`);
  const snapshot = await get(userRef);
  const now = serverTimestamp();

  const profile = {
    uid: firebaseUser.uid,
    displayName: firebaseUser.displayName || fallbackDisplayName || "Customer",
    email: firebaseUser.email || "",
    photoURL: firebaseUser.photoURL || "",
    updatedAt: now
  };

  if (!snapshot.exists()) {
    profile.role = ROLES.CUSTOMER;
    profile.status = STATUS.ACTIVE;
    profile.createdAt = now;
  }

  await update(userRef, profile);
}

function readStoredImpersonation() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(IMPERSONATION_SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (!session?.restoreToken || !session?.target?.uid || !session?.admin?.uid) {
      window.sessionStorage.removeItem(IMPERSONATION_SESSION_KEY);
      return null;
    }

    if (session.expiresAt && Date.now() > Number(session.expiresAt)) {
      window.sessionStorage.removeItem(IMPERSONATION_SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    window.sessionStorage.removeItem(IMPERSONATION_SESSION_KEY);
    return null;
  }
}

function writeStoredImpersonation(session) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(IMPERSONATION_SESSION_KEY, JSON.stringify(session));
}

function clearStoredImpersonation() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(IMPERSONATION_SESSION_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [claimsRole, setClaimsRole] = useState(null);
  const [profile, setProfile] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [impersonation, setImpersonation] = useState(() => readStoredImpersonation());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setClaimsRole(null);
        setProfile(null);
        setInitializing(false);
        return;
      }

      try {
        let token = await firebaseUser.getIdTokenResult(true);
        let claimRole = token?.claims?.role || null;

        const userSnap = await get(ref(db, `users/${firebaseUser.uid}`));
        let userProfile = userSnap.exists() ? userSnap.val() : null;

        if (!userProfile) {
          await upsertUserProfile(firebaseUser);
          const refreshedSnap = await get(ref(db, `users/${firebaseUser.uid}`));
          userProfile = refreshedSnap.exists() ? refreshedSnap.val() : null;
        }

        setProfile(userProfile);

        // Custom claims (what Storage rules trust) can drift from the database
        // role — e.g. a role set directly in the database, which Database rules
        // tolerate via a fallback check but Storage rules cannot. Heal it here
        // so a mismatched account isn't silently blocked from uploads.
        if (userProfile?.role && userProfile.role !== claimRole) {
          try {
            const result = await syncMyRoleClaims();
            if (result?.changed) {
              token = await firebaseUser.getIdTokenResult(true);
              claimRole = token?.claims?.role || null;
            }
          } catch (syncError) {
            console.error("Failed to sync role claims", syncError);
          }
        }

        setClaimsRole(claimRole);
      } catch (error) {
        console.error("Failed to initialize auth state", error);
      } finally {
        setInitializing(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !profile) return;

    if (!isActiveStatus(profile.status) && !impersonation) {
      signOut(auth).catch(() => null);
    }
  }, [user, profile, impersonation]);

  useEffect(() => {
    if (!impersonation?.expiresAt) return undefined;

    const remainingMs = Number(impersonation.expiresAt) - Date.now();
    if (remainingMs <= 0) {
      clearStoredImpersonation();
      setImpersonation(null);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      clearStoredImpersonation();
      setImpersonation(null);
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [impersonation?.expiresAt]);

  const value = useMemo(
    () => ({
      user,
      profile,
      role: claimsRole || profile?.role || ROLES.CUSTOMER,
      impersonation,
      isImpersonating: !!impersonation,
      initializing,
      isAuthenticated: !!user,
      isVerifiedEmail: !!user?.emailVerified,
      isActiveUser: isActiveStatus(profile?.status),
      authErrorMessage: friendlyAuthError,
      refreshTokenClaims: async () => {
        if (!auth.currentUser) return;
        await auth.currentUser.getIdToken(true);
      },
      signInEmail: async (email, password) => {
        const result = await signInWithEmailAndPassword(auth, email, password);
        await upsertUserProfile(result.user);
        return result.user;
      },
      registerEmail: async ({ displayName, email, password }) => {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
          await updateProfile(result.user, { displayName });
        }
        await upsertUserProfile(result.user, displayName);
        await sendEmailVerification(result.user);
        return result.user;
      },
      continueWithGoogle: async () => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const result = await signInWithPopup(auth, provider);
        await upsertUserProfile(result.user);
        return result.user;
      },
      resendVerification: async () => {
        if (!auth.currentUser) throw new Error("No signed-in user.");
        await sendEmailVerification(auth.currentUser);
      },
      resetPassword: (email) => sendPasswordResetEmail(auth, email),
      updateMyProfile: async (updates) => {
        if (!auth.currentUser) throw new Error("No signed-in user.");
        const safeUpdates = {
          displayName: updates.displayName || profile?.displayName || "",
          photoURL: updates.photoURL || profile?.photoURL || "",
          updatedAt: serverTimestamp()
        };

        await update(ref(db, `users/${auth.currentUser.uid}`), safeUpdates);
        setProfile((prev) => ({ ...prev, ...safeUpdates }));
      },
      startImpersonation: async (target, reason = "Admin dashboard impersonation") => {
        const targetUid = typeof target === "string" ? target : target?.uid;
        if (!auth.currentUser) throw new Error("No signed-in admin.");
        if (!targetUid) throw new Error("Choose a user to impersonate.");
        if (impersonation) throw new Error("Quit the current impersonation before starting another.");

        const response = await createImpersonationSession(targetUid, reason);
        const session = {
          admin: response.admin || {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email || profile?.email || "",
            displayName: auth.currentUser.displayName || profile?.displayName || "Admin",
            role: claimsRole || profile?.role || ROLES.ADMIN
          },
          target: response.target || {
            uid: targetUid,
            email: target?.email || "",
            displayName: target?.displayName || "User",
            role: target?.role || ROLES.CUSTOMER
          },
          restoreToken: response.restoreToken,
          startedAt: Date.now(),
          expiresAt: response.expiresAt || Date.now() + ((response.expiresIn || 3600) * 1000)
        };

        try {
          writeStoredImpersonation(session);
          setImpersonation(session);
          await setPersistence(auth, browserSessionPersistence);
          const result = await signInWithCustomToken(auth, response.customToken);
          await result.user.getIdToken(true);
          return response;
        } catch (error) {
          clearStoredImpersonation();
          setImpersonation(null);
          await setPersistence(auth, browserLocalPersistence).catch(() => null);
          throw error;
        }
      },
      quitImpersonation: async () => {
        const activeSession = impersonation || readStoredImpersonation();
        if (!activeSession?.restoreToken) throw new Error("No active impersonation session.");

        await setPersistence(auth, browserLocalPersistence);
        const result = await signInWithCustomToken(auth, activeSession.restoreToken);
        await result.user.getIdToken(true);
        clearStoredImpersonation();
        setImpersonation(null);
        return result.user;
      },
      signOutUser: async () => {
        clearStoredImpersonation();
        setImpersonation(null);
        await setPersistence(auth, browserLocalPersistence).catch(() => null);
        return signOut(auth);
      }
    }),
    [user, claimsRole, profile, initializing, impersonation]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider.");
  return ctx;
}
