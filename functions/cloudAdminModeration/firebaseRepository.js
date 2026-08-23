"use strict";

const { CLOUD_STORAGE_CONFIG } = require("../cloudStorage/config");
const { assertCanonicalStorageBinding } = require("../cloudStorage/validation");
const { FieldPath, FieldValue } = require("firebase-admin/firestore");

function safeDispositionName(value = "archivo") {
  const fallback = String(value || "archivo").replace(/[\r\n"\\]/gu, "_").slice(0, 180) || "archivo";
  return { fallback, encoded: encodeURIComponent(fallback) };
}

function countValue(snapshot) {
  return Number(snapshot?.data?.().count) || 0;
}

function createFirebaseAdminCloudRepository({ admin, db, bucket }) {
  const users = db.collection(CLOUD_STORAGE_CONFIG.usersCollection);

  return {
    async getUser(uid) {
      const snapshot = await users.doc(uid).get();
      return snapshot.exists ? snapshot.data() : null;
    },

    async getUsage(ownerUid) {
      const snapshot = await users.doc(ownerUid)
        .collection(CLOUD_STORAGE_CONFIG.usageCollection)
        .doc(CLOUD_STORAGE_CONFIG.usageDocument)
        .get();
      return snapshot.exists ? snapshot.data() : null;
    },

    async getCounts(ownerUid) {
      const collection = users.doc(ownerUid).collection(CLOUD_STORAGE_CONFIG.filesCollection);
      const [activeFiles, activeFolders, trashItems] = await Promise.all([
        collection.where("deleted", "==", false).where("type", "==", "file").count().get(),
        collection.where("deleted", "==", false).where("type", "==", "folder").count().get(),
        collection.where("deleted", "==", true).count().get()
      ]);
      return {
        activeFiles: countValue(activeFiles),
        activeFolders: countValue(activeFolders),
        trashItems: countValue(trashItems)
      };
    },

    async listItems({ ownerUid, parentFolderId, deleted, pageSize, cursor }) {
      let query = users.doc(ownerUid)
        .collection(CLOUD_STORAGE_CONFIG.filesCollection)
        .where("deleted", "==", deleted)
        .where("parentFolderId", "==", parentFolderId)
        .orderBy("nameNormalized", "asc")
        .orderBy(FieldPath.documentId(), "asc");
      if (cursor) query = query.startAfter(cursor.nameNormalized, cursor.id);
      const snapshot = await query.limit(pageSize + 1).get();
      const visibleDocs = snapshot.docs.slice(0, pageSize);
      const hasMore = snapshot.docs.length > pageSize;
      const last = visibleDocs.at(-1);
      return {
        items: visibleDocs.map((doc) => ({ id: doc.id, data: doc.data() })),
        nextCursor: hasMore && last
          ? { id: last.id, nameNormalized: String(last.data().nameNormalized || "") }
          : null
      };
    },

    async getItem(ownerUid, fileId) {
      const snapshot = await users.doc(ownerUid)
        .collection(CLOUD_STORAGE_CONFIG.filesCollection)
        .doc(fileId)
        .get();
      return snapshot.exists ? snapshot.data() : null;
    },

    async getObjectMetadata(binding) {
      const canonical = assertCanonicalStorageBinding(binding);
      try {
        const [metadata] = await bucket.file(canonical.storagePath).getMetadata();
        return metadata || null;
      } catch (error) {
        if (Number(error?.code) === 404) return null;
        throw error;
      }
    },

    async createReadUrl(binding, { expiresAt, mimeType, name, operation }) {
      const canonical = assertCanonicalStorageBinding(binding);
      const dispositionName = safeDispositionName(name);
      const disposition = `${operation === "download" ? "attachment" : "inline"}; filename="${dispositionName.fallback}"; filename*=UTF-8''${dispositionName.encoded}`;
      const [url] = await bucket.file(canonical.storagePath).getSignedUrl({
        action: "read",
        expires: expiresAt,
        responseDisposition: disposition,
        responseType: mimeType,
        version: "v4"
      });
      return url;
    },

    async writeAudit(event) {
      await db.collection("auditoria").add({
        ...event,
        fecha: FieldValue.serverTimestamp(),
        fechaTexto: new Date().toISOString()
      });
    }
  };
}

module.exports = { createFirebaseAdminCloudRepository, safeDispositionName };
