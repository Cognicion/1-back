import { db } from "../../firebase.js";
import { DOCX_IMPORT_CONFIG } from "./docxImportConfig.js";
import {
  collection,
  getDocs,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function buscarImportacionDuplicada({ hash, usuarioUid }) {
  if (!hash || !usuarioUid) return null;
  const snap = await getDocs(query(
    collection(db, DOCX_IMPORT_CONFIG.duplicateCollection),
    where("hash", "==", hash),
    where("usuarioUid", "==", usuarioUid),
    limit(1)
  ));
  if (snap.empty) return null;
  const docImportacion = snap.docs[0];
  return { id: docImportacion.id, ...docImportacion.data() };
}
