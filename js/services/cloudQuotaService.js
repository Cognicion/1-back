import { db } from "../firebase.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const MAX_STORAGE_BYTES = 250 * 1024 * 1024;

export function normalizeCloudUsage(value = {}) {
  const usedBytes = Math.max(0, Number(value.usedBytes) || 0);
  const reservedBytes = Math.max(0, Number(value.reservedBytes) || 0);
  const maxBytes = Math.max(1, Number(value.maxBytes) || MAX_STORAGE_BYTES);
  return {
    usedBytes,
    reservedBytes,
    maxBytes,
    committedPercent: Math.min(100, (usedBytes / maxBytes) * 100),
    allocatedPercent: Math.min(100, ((usedBytes + reservedBytes) / maxBytes) * 100),
    availableBytes: Math.max(0, maxBytes - usedBytes - reservedBytes)
  };
}

export function subscribeCloudUsage(uid, onValue, onError = () => {}) {
  if (!uid) {
    onValue?.(normalizeCloudUsage());
    return () => {};
  }
  return onSnapshot(
    doc(db, "usuarios", uid, "cloudStorageUsage", "current"),
    (snapshot) => onValue?.(normalizeCloudUsage(snapshot.exists() ? snapshot.data() : {})),
    onError
  );
}
