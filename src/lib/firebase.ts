/// <reference types="vite/client" />
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';

function readEnvString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getFirebaseConfig() {
  return {
    apiKey: readEnvString(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: readEnvString(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    databaseURL: readEnvString(import.meta.env.VITE_FIREBASE_DATABASE_URL),
    projectId: readEnvString(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    appId: readEnvString(import.meta.env.VITE_FIREBASE_APP_ID),
  };
}

let cachedDatabase: Database | null = null;

/**
 * Return whether the minimum required Vite Firebase RTDB environment variables are present.
 */
export function isFirebaseConfigured(): boolean {
  const config = getFirebaseConfig();
  return Boolean(config.apiKey && config.databaseURL);
}

function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) {
    return null;
  }

  const existing = getApps()[0];
  if (existing) {
    return existing;
  }

  const config = getFirebaseConfig();
  try {
    return initializeApp({
      apiKey: config.apiKey,
      databaseURL: config.databaseURL,
      ...(config.authDomain ? { authDomain: config.authDomain } : {}),
      ...(config.projectId ? { projectId: config.projectId } : {}),
      ...(config.appId ? { appId: config.appId } : {}),
    });
  } catch {
    return null;
  }
}

/**
 * Return the singleton Firebase Realtime Database instance, or null when unconfigured.
 */
export function getFirebaseDatabase(): Database | null {
  if (cachedDatabase) {
    return cachedDatabase;
  }

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  try {
    cachedDatabase = getDatabase(app);
    return cachedDatabase;
  } catch {
    return null;
  }
}
