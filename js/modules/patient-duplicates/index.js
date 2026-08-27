import { getAuthenticatedUserOnce, getUserProfileOnce } from "../../services/authContextService.js";
import { registrarEventoAuditoria } from "../../services/auditoria.js";
import { listarPacientes } from "../../services/usuarios.js?v=20260827-panel-pacientes-fallback-v1";
import { db } from "../../firebase.js";
import { obtenerNombrePacienteParaMostrar, normalizarTextoBusquedaPaciente } from "../../utils/nombresPacientes.js";
import {
  collection,
  doc,
  getDocs,
  arrayUnion,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let modal = null;
let currentRows = [];
let principalId = "";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function normalizeRecord(value = "") {
  return normalizarTextoBusquedaPaciente(value).replace(/[^a-z0-9]+/g, "");
}

function patientIdentity(patient = {}) {
  const institucional = patient.datosInstitucionales || {};
  return {
    name: obtenerNombrePacienteParaMostrar(patient),
    nameKey: normalizarTextoBusquedaPaciente(obtenerNombrePacienteParaMostrar(patient)),
    expediente: patient.expediente || patient.numeroExpediente || institucional.expediente || "",
    expedienteKey: normalizeRecord(patient.expediente || patient.numeroExpediente || institucional.expediente || ""),
    fechaNacimiento: patient.fechaNacimiento || institucional.fechaNacimiento || "",
    edad: patient.edadManual || patient.edad || institucional.edadManual || "",
    cama: patient.cama || institucional.cama || ""
  };
}

async function countSubcollection(patientId, name) {
  const snap = await getDocs(collection(db, "usuarios", patientId, name));
  return { count: snap.size, docs: snap.docs };
}

async function enrichPatient(patient) {
  const [notes, documents] = await Promise.all([
    countSubcollection(patient.id, "notasMedicas").catch(() => ({ count: 0, docs: [] })),
    countSubcollection(patient.id, "documentosImportados").catch(() => ({ count: 0, docs: [] }))
  ]);
  return {
    ...patient,
    identity: patientIdentity(patient),
    relationCounts: {
      notas: notes.count,
      documentos: documents.count,
      diagnosticos: Array.isArray(patient.historialDiagnosticos) ? patient.historialDiagnosticos.length : 0,
      tratamientos: Array.isArray(patient.tratamientoActual) ? patient.tratamientoActual.length : 0
    }
  };
}

function scorePrincipal(patient) {
  const identity = patient.identity || patientIdentity(patient);
  return [
    identity.expediente ? 5 : 0,
    identity.fechaNacimiento ? 4 : 0,
    Number(patient.relationCounts?.notas || 0) * 3,
    Number(patient.relationCounts?.documentos || 0) * 2,
    patient.fechaCreacion ? 1 : 0
  ].reduce((a, b) => a + b, 0);
}

function ensureModal() {
  if (modal) return modal;
  modal = document.createElement("div");
  modal.className = "patient-duplicates-modal";
  modal.innerHTML = `
    <section class="patient-duplicates-panel" role="dialog" aria-modal="true">
      <header>
        <div>
          <p>Revision administrativa</p>
          <h2>Duplicados de pacientes</h2>
        </div>
        <button type="button" data-dup-close>Cerrar</button>
      </header>
      <div class="patient-duplicates-body">
        <label>Nombre a revisar
          <input data-dup-search value="FILEMON CECILIO ARTEAGA BALTAZAR">
        </label>
        <div class="patient-duplicates-actions">
          <button type="button" data-dup-scan>Buscar duplicados</button>
          <button type="button" data-dup-merge disabled>Fusionar seleccionados</button>
        </div>
        <div data-dup-status></div>
        <div data-dup-results></div>
      </div>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-dup-close]")?.addEventListener("click", () => modal.classList.remove("abierto"));
  modal.querySelector("[data-dup-scan]")?.addEventListener("click", scanDuplicates);
  modal.querySelector("[data-dup-merge]")?.addEventListener("click", mergeDuplicates);
  modal.addEventListener("change", (event) => {
    const radio = event.target.closest("[data-dup-principal]");
    if (radio) principalId = radio.value;
  });
  return modal;
}

function renderRows(rows = []) {
  const results = modal.querySelector("[data-dup-results]");
  const mergeButton = modal.querySelector("[data-dup-merge]");
  mergeButton.disabled = rows.length < 2;
  if (!rows.length) {
    results.innerHTML = "<p>No se encontraron duplicados autorizados para ese nombre.</p>";
    return;
  }
  results.innerHTML = `
    <table>
      <thead><tr><th>Principal</th><th>Nombre</th><th>Expediente</th><th>Nacimiento</th><th>Cama</th><th>Creacion</th><th>Notas</th><th>Docs</th><th>Estado</th></tr></thead>
      <tbody>
        ${rows.map((patient) => `
          <tr>
            <td><input type="radio" name="dupPrincipal" data-dup-principal value="${escapeHtml(patient.id)}" ${patient.id === principalId ? "checked" : ""}></td>
            <td>${escapeHtml(patient.identity.name)}<br><small>${escapeHtml(patient.id)}</small></td>
            <td>${escapeHtml(patient.identity.expediente || "Sin expediente")}</td>
            <td>${escapeHtml(patient.identity.fechaNacimiento || "Sin registro")}</td>
            <td>${escapeHtml(patient.identity.cama || "Sin registro")}</td>
            <td>${escapeHtml(patient.fechaCreacion || patient.createdAtIso || "Sin registro")}</td>
            <td>${patient.relationCounts.notas}</td>
            <td>${patient.relationCounts.documentos}</td>
            <td>${escapeHtml(patient.status || "activo")}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

async function scanDuplicates() {
  const user = await getAuthenticatedUserOnce();
  if (!user) throw new Error("No se pudo identificar al usuario.");
  const target = normalizarTextoBusquedaPaciente(modal.querySelector("[data-dup-search]")?.value || "");
  modal.querySelector("[data-dup-status]").textContent = "Buscando duplicados autorizados...";
  const snap = await listarPacientes(user.uid, { forzar: true });
  const rows = await Promise.all(snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((patient) => patient.rol === "paciente")
    .filter((patient) => normalizarTextoBusquedaPaciente(obtenerNombrePacienteParaMostrar(patient)) === target)
    .map(enrichPatient));
  currentRows = rows.sort((a, b) => scorePrincipal(b) - scorePrincipal(a));
  principalId = currentRows[0]?.id || "";
  modal.querySelector("[data-dup-status]").textContent = `Duplicados encontrados: ${currentRows.length}`;
  console.info("[PATIENT DUPLICATES]", {
    module: "patient-duplicates",
    stage: "scan-completed",
    count: currentRows.length,
    patientIds: currentRows.map((item) => item.id)
  });
  renderRows(currentRows);
}

async function copySubcollection({ fromPatientId, toPatientId, collectionName, batch, mergedBy }) {
  const snap = await getDocs(collection(db, "usuarios", fromPatientId, collectionName));
  snap.docs.forEach((item) => {
    const targetRef = doc(db, "usuarios", toPatientId, collectionName, `${fromPatientId}_${item.id}`);
    batch.set(targetRef, {
      ...item.data(),
      mergedFromPatientId: fromPatientId,
      mergedIntoPatientId: toPatientId,
      mergedBy,
      mergedAt: new Date().toISOString()
    }, { merge: true });
  });
  return snap.size;
}

async function mergeDuplicates() {
  const user = await getAuthenticatedUserOnce();
  const profile = await getUserProfileOnce(user?.uid || "");
  if (!user) throw new Error("No se pudo identificar al usuario.");
  if (!principalId) return;
  const principal = currentRows.find((item) => item.id === principalId);
  const duplicates = currentRows.filter((item) => item.id !== principalId);
  if (!principal || !duplicates.length) return;
  const ok = confirm(`Fusionar ${duplicates.length} duplicados hacia ${principal.identity.name}? No se borraran registros; quedaran archivados como merged.`);
  if (!ok) return;

  modal.querySelector("[data-dup-status]").textContent = "Fusionando duplicados...";
  let notesMoved = 0;
  let docsMoved = 0;
  for (const duplicate of duplicates) {
    const batch = writeBatch(db);
    notesMoved += await copySubcollection({ fromPatientId: duplicate.id, toPatientId: principal.id, collectionName: "notasMedicas", batch, mergedBy: user.uid });
    docsMoved += await copySubcollection({ fromPatientId: duplicate.id, toPatientId: principal.id, collectionName: "documentosImportados", batch, mergedBy: user.uid });
    batch.set(doc(db, "usuarios", principal.id), {
      mergedDuplicatePatientIds: arrayUnion(duplicate.id),
      fechaUltimaFusion: new Date().toISOString()
    }, { merge: true });
    batch.update(doc(db, "usuarios", duplicate.id), {
      status: "merged",
      mergedIntoPatientId: principal.id,
      mergedAt: new Date().toISOString(),
      mergedBy: user.uid,
      hiddenFromActiveLists: true
    });
    await batch.commit();
  }
  await registrarEventoAuditoria({
    accion: "fusionar_duplicados_paciente",
    modulo: "Duplicados de pacientes",
    descripcion: "Fusion controlada de pacientes duplicados sin borrado fisico.",
    usuarioUid: user.uid,
    usuarioNombre: profile?.nombre || profile?.nombreCompleto || user.email || "",
    usuarioRol: profile?.rol || "",
    pacienteUid: principal.id,
    pacienteNombre: principal.identity.name,
    exito: true,
    detalles: { duplicados: duplicates.map((item) => item.id), notesMoved, docsMoved }
  }).catch(() => {});
  modal.querySelector("[data-dup-status]").textContent = `Fusion completada. Notas movidas: ${notesMoved}. Documentos movidos: ${docsMoved}.`;
  window.dispatchEvent(new CustomEvent("cognicion:patient-duplicates-merged", { detail: { principalId, duplicates: duplicates.map((item) => item.id) } }));
}

export function openPatientDuplicateReview() {
  ensureModal().classList.add("abierto");
}
