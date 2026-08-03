import { db } from "../../firebase.js";
import { DOCX_IMPORT_CONFIG } from "./docxImportConfig.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function trazaDuplicados(etapa, datos = {}) {
  console.info("[DOCX IMPORT]", {
    module: "docx-import",
    stage: "duplicate-check",
    step: etapa,
    ...datos
  });
}

function normalizarErrorPermisos(error) {
  if (error?.code === "permission-denied") {
    return new Error("No fue posible verificar si el documento ya fue importado porque tu cuenta no tiene permiso para consultar este registro.");
  }
  return error;
}

export async function buscarImportacionDuplicada({ hash, usuarioUid, rol = "" }) {
  if (!hash || !usuarioUid) return null;
  const path = `usuarios/${usuarioUid}/${DOCX_IMPORT_CONFIG.duplicateUserSubcollection}/${hash}`;
  trazaDuplicados("start", {
    operation: "getDoc",
    path,
    uid: usuarioUid,
    role: rol || "",
    query: { scope: "user-subcollection", sourceFileHash: hash }
  });
  try {
    const snap = await getDoc(doc(db, "usuarios", usuarioUid, DOCX_IMPORT_CONFIG.duplicateUserSubcollection, hash));
    trazaDuplicados("success", {
      operation: "getDoc",
      path,
      uid: usuarioUid,
      role: rol || "",
      found: snap.exists()
    });
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    trazaDuplicados("error", {
      operation: "getDoc",
      path,
      uid: usuarioUid,
      role: rol || "",
      errorCode: error?.code || error?.name || "unknown"
    });
    throw normalizarErrorPermisos(error);
  }
}
