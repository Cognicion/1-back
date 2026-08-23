import { db, obtenerFunctions, obtenerStorage } from "../firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const CLOUD_PAGE_SIZE = 40;

let functionsSdkPromise = null;
let storageSdkPromise = null;

function getFunctionsSdk() {
  if (!functionsSdkPromise) {
    functionsSdkPromise = import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
  }
  return functionsSdkPromise;
}

function getStorageSdk() {
  if (!storageSdkPromise) {
    storageSdkPromise = import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");
  }
  return storageSdkPromise;
}

async function callCloud(name, payload = {}) {
  const [functions, { httpsCallable }] = await Promise.all([obtenerFunctions(), getFunctionsSdk()]);
  const result = await httpsCallable(functions, name)(payload);
  return result.data || {};
}

function mapCloudDocument(snapshot) {
  return { id: snapshot.id, sourceType: "cloud-file", ...snapshot.data() };
}

export async function listFolderContents(uid, options = {}) {
  if (!uid) return { items: [], cursor: null, hasMore: false };
  const pageSize = Math.min(Math.max(Number(options.pageSize) || CLOUD_PAGE_SIZE, 1), 50);
  const sort = ["recent", "name-desc"].includes(options.sort) ? options.sort : "name-asc";
  const constraints = [where("deleted", "==", false)];
  constraints.push(where("parentFolderId", "==", options.parentFolderId || null));
  constraints.push(sort === "recent"
    ? orderBy("updatedAt", "desc")
    : orderBy("nameNormalized", sort === "name-desc" ? "desc" : "asc"));
  if (options.cursor) constraints.push(startAfter(options.cursor));
  constraints.push(limit(pageSize + 1));

  const snapshot = await getDocs(query(
    collection(db, "usuarios", uid, "cloudFiles"),
    ...constraints
  ));
  const documents = snapshot.docs;
  const hasMore = documents.length > pageSize;
  const visible = hasMore ? documents.slice(0, pageSize) : documents;
  return {
    items: visible.map(mapCloudDocument),
    cursor: visible.at(-1) || null,
    hasMore
  };
}

export async function listTrashContents(uid, options = {}) {
  if (!uid) return { items: [], cursor: null, hasMore: false };
  const pageSize = Math.min(Math.max(Number(options.pageSize) || CLOUD_PAGE_SIZE, 1), 50);
  const constraints = [where("deleted", "==", true), orderBy("updatedAt", "desc")];
  if (options.cursor) constraints.push(startAfter(options.cursor));
  constraints.push(limit(pageSize + 1));
  const snapshot = await getDocs(query(
    collection(db, "usuarios", uid, "cloudFiles"),
    ...constraints
  ));
  const hasMore = snapshot.docs.length > pageSize;
  const visible = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;
  return {
    items: visible.map(mapCloudDocument),
    cursor: visible.at(-1) || null,
    hasMore
  };
}

export async function listChildFolders(uid, options = {}) {
  if (!uid) return { items: [], cursor: null, hasMore: false };
  const pageSize = Math.min(Math.max(Number(options.pageSize) || CLOUD_PAGE_SIZE, 1), 50);
  const constraints = [
    where("deleted", "==", false),
    where("type", "==", "folder"),
    where("parentFolderId", "==", options.parentFolderId || null),
    orderBy("nameNormalized", "asc")
  ];
  if (options.cursor) constraints.push(startAfter(options.cursor));
  constraints.push(limit(pageSize + 1));
  const snapshot = await getDocs(query(
    collection(db, "usuarios", uid, "cloudFiles"),
    ...constraints
  ));
  const hasMore = snapshot.docs.length > pageSize;
  const visible = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;
  return {
    items: visible.map(mapCloudDocument),
    cursor: visible.at(-1) || null,
    hasMore
  };
}

export async function getCloudItem(uid, itemId) {
  if (!uid || !itemId) return null;
  const snapshot = await getDoc(doc(db, "usuarios", uid, "cloudFiles", itemId));
  return snapshot.exists() ? mapCloudDocument(snapshot) : null;
}

export function waitForCloudItem(uid, itemId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(new Error("La carga terminó, pero la confirmación está tardando más de lo esperado."));
    }, timeoutMs);

    unsubscribe = onSnapshot(
      doc(db, "usuarios", uid, "cloudFiles", itemId),
      (snapshot) => {
        if (settled || !snapshot.exists()) return;
        const item = mapCloudDocument(snapshot);
        if (item.status && item.status !== "ready") return;
        settled = true;
        window.clearTimeout(timer);
        unsubscribe();
        resolve(item);
      },
      (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        unsubscribe();
        reject(error);
      }
    );
  });
}

export const reserveCloudUpload = (payload) => callCloud("reserveCloudUpload", payload);
export const confirmCloudUpload = (payload) => callCloud("confirmCloudUpload", payload);
export const cancelCloudUpload = (payload) => callCloud("cancelCloudUpload", payload);
export const createCloudFolder = (payload) => callCloud("createCloudFolder", payload);
export const renameCloudItem = (payload) => callCloud("renameCloudItem", payload);
export const moveCloudItem = (payload) => callCloud("moveCloudItem", payload);
export const trashCloudItem = (payload) => callCloud("trashCloudItem", payload);
export const restoreCloudItem = (payload) => callCloud("restoreCloudItem", payload);
export const permanentlyDeleteCloudItem = (payload) => callCloud("permanentlyDeleteCloudItem", payload);
export const reconcileCloudStorageUsage = (payload = {}) => callCloud("reconcileCloudStorageUsage", payload);

export async function uploadReservedFile({ file, reservation, onProgress, onTask }) {
  const [storage, { ref, uploadBytesResumable }] = await Promise.all([obtenerStorage(), getStorageSdk()]);
  const storageRef = ref(storage, reservation.storagePath);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: reservation.mimeType || file.type,
    contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(reservation.originalName || file.name)}`,
    customMetadata: {
      ownerId: reservation.ownerId,
      fileId: reservation.fileId,
      reservationId: reservation.reservationId || reservation.fileId
    }
  });
  onTask?.(task);

  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        const total = snapshot.totalBytes || file.size || 1;
        onProgress?.(Math.min(100, Math.round((snapshot.bytesTransferred / total) * 100)), snapshot);
      },
      reject,
      () => resolve(task.snapshot)
    );
  });
}

export async function getPrivateCloudBlob(storagePath, maxDownloadBytes = 250 * 1024 * 1024) {
  const [storage, { getBlob, ref }] = await Promise.all([obtenerStorage(), getStorageSdk()]);
  return getBlob(ref(storage, storagePath), maxDownloadBytes);
}

export async function downloadPrivateCloudFile(item) {
  const blob = await getPrivateCloudBlob(item.storagePath);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = item.name || item.originalName || "archivo";
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
