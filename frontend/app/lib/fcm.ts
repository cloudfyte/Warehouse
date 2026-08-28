"use client";
/**
 * Firebase Cloud Messaging client helper.
 * Handles service-worker registration, token acquisition, and GraphQL
 * mutations to save/delete the token on the backend.
 *
 * All Firebase imports are dynamic to avoid SSR issues.
 */

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const API_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:8000/graphql/";

async function gql(query: string, variables: Record<string, unknown> = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
  const r = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `JWT ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  } catch {
    return null;
  }
}

export async function initFCM(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // Use sessionStorage to avoid re-registering every page load
  const cached = sessionStorage.getItem("fcm_token");
  if (cached) return cached;

  try {
    const { getFirebaseApp } = await import("./firebase");
    const app = await getFirebaseApp();
    if (!app) return null;

    const { getMessaging, getToken, onMessage } = await import("firebase/messaging");
    const sw = await registerServiceWorker();
    if (!sw) return null;

    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: sw,
    });

    if (!token) return null;

    sessionStorage.setItem("fcm_token", token);

    // Save token on backend
    await gql(
      `mutation S($t:String!){saveFcmToken(token:$t){success}}`,
      { t: token }
    );

    // Foreground push: dispatch custom event so NotificationBell can update immediately
    onMessage(messaging, payload => {
      const data = payload.data || {};
      window.dispatchEvent(new CustomEvent("fcm:new-notification", { detail: data }));
      // Also show a browser notification when the app tab is open
      sw.showNotification(data.title || "GarmentFlow", {
        body: data.body || "",
        icon: "/logo.png",
        data,
      });
    });

    return token;
  } catch (err) {
    console.warn("FCM init failed:", err);
    return null;
  }
}

export async function removeFCMToken(): Promise<void> {
  const token = sessionStorage.getItem("fcm_token");
  if (!token) return;
  sessionStorage.removeItem("fcm_token");
  try {
    await gql(`mutation D($t:String!){deleteFcmToken(token:$t){success}}`, { t: token });
  } catch {
    // best-effort
  }
}
