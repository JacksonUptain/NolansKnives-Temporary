import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "firebase/auth";
import { get, ref, serverTimestamp, update } from "firebase/database";
import { auth, db } from "../pages/firebase";
import { ROLES, STATUS, isActiveStatus } from "./roleHelpers";

const AuthContext = createContext(null);

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [claimsRole, setClaimsRole] = useState(null);
  const [profile, setProfile] = useState(null);
  const [initializing, setInitializing] = useState(true);

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
        const token = await firebaseUser.getIdTokenResult(true);
        const claimRole = token?.claims?.role;
        setClaimsRole(claimRole || null);

        const userSnap = await get(ref(db, `users/${firebaseUser.uid}`));
        const userProfile = userSnap.exists() ? userSnap.val() : null;

        if (!userProfile) {
          await upsertUserProfile(firebaseUser);
          const refreshedSnap = await get(ref(db, `users/${firebaseUser.uid}`));
          setProfile(refreshedSnap.exists() ? refreshedSnap.val() : null);
        } else {
          setProfile(userProfile);
        }
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

    if (!isActiveStatus(profile.status)) {
      signOut(auth).catch(() => null);
    }
  }, [user, profile]);

  const value = useMemo(
    () => ({
      user,
      profile,
      role: claimsRole || profile?.role || ROLES.CUSTOMER,
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
      signOutUser: () => signOut(auth)
    }),
    [user, claimsRole, profile, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider.");
  return ctx;
}
