import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase.js";

const LEGACY_KEYS = ["cognicion.apariencia.modoInterfaz", "theme"];
const LAST_THEME_STORAGE_KEY = "cognicion:theme:last";
const pendingByUid = new Map();
const userSelectionVersion = new Map();

export function getThemeStorageKey(uid) {
  return `cognicion:theme:${uid}`;
}

export function normalizeTheme(value) {
  return value === "light" ? "light" : "dark";
}

function isValidTheme(value) {
  return value === "light" || value === "dark";
}

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch (error) { console.warn("No se pudo guardar el tema local.", error); }
}

function writeLastTheme(value) {
  writeStorage(LAST_THEME_STORAGE_KEY, value);
}

function removeStorage(key) {
  try { localStorage.removeItem(key); } catch { /* almacenamiento no disponible */ }
}

export function updateThemeSelectorUI(theme) {
  const normalized = normalizeTheme(theme);
  document.querySelectorAll("[data-theme-option], [data-cognicion-theme]").forEach((button) => {
    const value = button.dataset.themeOption || button.dataset.cognicionTheme;
    const active = value === normalized;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("is-active", active);
  });
}

export function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = normalizedTheme;
  root.style.colorScheme = normalizedTheme;
  root.style.backgroundColor = normalizedTheme === "dark" ? "#050505" : "#f3f3f1";
  updateThemeSelectorUI(normalizedTheme);
  return normalizedTheme;
}

export function migrateLegacyTheme(uid) {
  if (!uid) return;
  const storageKey = getThemeStorageKey(uid);
  if (readStorage(storageKey)) {
    LEGACY_KEYS.forEach(removeStorage);
    return;
  }
  const legacy = LEGACY_KEYS.map(readStorage).find(isValidTheme);
  if (legacy) writeStorage(storageKey, legacy);
  LEGACY_KEYS.forEach(removeStorage);
}

function getRemoteTheme(profile = {}) {
  const value = profile?.preferencias?.tema
    || profile?.preferencias?.apariencia?.modoInterfaz
    || profile?.preferencias?.apariencia?.tema
    || profile?.apariencia?.tema
    || profile?.temaApariencia;
  return isValidTheme(value) ? value : null;
}

export async function getThemeFromUserProfile(uid, profile = null) {
  if (!uid) return null;
  if (profile) return getRemoteTheme(profile);
  const snapshot = await getDoc(doc(db, "usuarios", uid));
  return snapshot.exists() ? getRemoteTheme(snapshot.data()) : null;
}

export async function initializeThemeForUser(user, profile = null) {
  const uid = user?.uid;
  if (!uid) return applyTheme(document.documentElement.dataset.theme || readStorage(LAST_THEME_STORAGE_KEY) || "dark");
  if (pendingByUid.has(uid)) return pendingByUid.get(uid);

  const task = (async () => {
    const versionAtStart = userSelectionVersion.get(uid) || 0;
    migrateLegacyTheme(uid);
    const storageKey = getThemeStorageKey(uid);
    const localValue = readStorage(storageKey) || readStorage(LAST_THEME_STORAGE_KEY) || document.documentElement.dataset.theme;
    const localTheme = normalizeTheme(localValue);
    applyTheme(localTheme);

    try {
      const remoteTheme = await getThemeFromUserProfile(uid, profile);
      console.debug("[ThemeBootstrap] sincronización remota finalizada", {
        localTheme,
        remoteTheme: remoteTheme || null,
        discrepancia: Boolean(remoteTheme && remoteTheme !== localTheme)
      });
      if (isValidTheme(remoteTheme) && versionAtStart === (userSelectionVersion.get(uid) || 0)) {
        const appliedTheme = applyTheme(remoteTheme);
        writeStorage(storageKey, appliedTheme);
        writeLastTheme(appliedTheme);
        return appliedTheme;
      }
    } catch (error) {
      console.warn("No se pudo recuperar el tema remoto. Se conserva el tema local.", error);
    }
    if (versionAtStart !== (userSelectionVersion.get(uid) || 0)) {
      return normalizeTheme(readStorage(storageKey));
    }
    writeStorage(storageKey, localTheme);
    writeLastTheme(localTheme);
    return localTheme;
  })().finally(() => pendingByUid.delete(uid));

  pendingByUid.set(uid, task);
  return task;
}

export async function saveThemeToUserProfile(uid, theme) {
  if (!uid) return;
  const userRef = doc(db, "usuarios", uid);
  const payload = {
    "preferencias.tema": theme,
    "preferencias.apariencia.modoInterfaz": theme
  };
  try {
    await updateDoc(userRef, payload);
  } catch (error) {
    await setDoc(userRef, { preferencias: { tema: theme, apariencia: { modoInterfaz: theme } } }, { merge: true });
  }
}

export async function setThemeForUser(user, theme) {
  const normalizedTheme = applyTheme(theme);
  if (!user?.uid) return normalizedTheme;
  userSelectionVersion.set(user.uid, (userSelectionVersion.get(user.uid) || 0) + 1);
  const storageKey = getThemeStorageKey(user.uid);
  writeStorage(storageKey, normalizedTheme);
  writeLastTheme(normalizedTheme);
  try {
    await saveThemeToUserProfile(user.uid, normalizedTheme);
    console.debug("[ThemeBootstrap] preferencia sincronizada con Firestore", { appliedTheme: normalizedTheme });
  } catch (error) {
    console.warn("El tema se guardó localmente, pero no pudo sincronizarse con Firestore.", error);
  }
  return normalizedTheme;
}
