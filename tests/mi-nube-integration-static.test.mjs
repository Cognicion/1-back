import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), "utf8");

const miNubeHtml = leer("../mi-nube.html");
const dashboardHtml = leer("../dashboard.html");
const medicoHtml = leer("../medico.html");
const apuntesHtml = leer("../apuntes.html");
const apuntesControlador = leer("../js/apuntes.js");
const accesosRapidos = leer("../js/components/accesosRapidos.js");
const miNubeControlador = leer("../js/mi-nube.js");
const miNubeCore = leer("../js/mi-nube-core.js");
const archivosService = leer("../js/services/cloudFilesService.js");
const cuotaService = leer("../js/services/cloudQuotaService.js");
const previewService = leer("../js/services/cloudPreviewService.js");
const previewCore = leer("../js/cloud-preview-core.js");
const puenteApuntes = leer("../js/services/notesCloudBridgeService.js");
const proyeccionApuntes = leer("../js/notes-cloud-projection-core.js");
const storageRules = leer("../storage.rules");
const firestoreRules = leer("../firestore.rules");
const firestoreRulesRecuperadas = leer("../docs/firebase-firestore-rules-deployed-2026-07-13.rules");
const storageCors = JSON.parse(leer("../storage.cors.json"));
const storageCorsScript = leer("../scripts/storage-cors-cognicion.ps1");
const firebaseConfig = JSON.parse(leer("../firebase.json"));
const cloudConfig = leer("../functions/cloudStorage/config.js");
const cloudValidation = leer("../functions/cloudStorage/validation.js");
const cloudHandlers = leer("../functions/cloudStorage/handlers.js");
const clinicalAnalyticsConfig = leer("../functions/clinicalAnalytics/config.js");
const clinicalAnalyticsHandlers = leer("../functions/clinicalAnalytics/handlers.js");
const functionsIndex = leer("../functions/index.js");
const appVersion = leer("../js/config/appVersion.js");

function escaparRegExp(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertTieneId(html, id) {
  assert.match(html, new RegExp(`\\bid=["']${escaparRegExp(id)}["']`), `Falta #${id}`);
}

test("la navegación agrega Mi nube sin sustituir la ruta independiente de Mis apuntes", () => {
  assert.match(dashboardHtml, /<h3>Mi nube<\/h3>[\s\S]*href="mi-nube\.html"/);
  assert.match(medicoHtml, /window\.location\.href='apuntes\.html'[\s\S]*Mis apuntes/);
  assert.match(medicoHtml, /window\.location\.href='mi-nube\.html'[\s\S]*Mi nube/);
  assert.match(accesosRapidos, /value:\s*"apuntes\.html",\s*label:\s*"Mis apuntes"/);
  assert.match(accesosRapidos, /value:\s*"mi-nube\.html",\s*label:\s*"Mi nube"/);

  assert.match(apuntesHtml, /<title>Mis apuntes \| Cognición<\/title>/);
  assert.match(apuntesHtml, /<script type="module" src="js\/apuntes\.js\?[^"']+"><\/script>/);
  assert.match(miNubeHtml, /<a href="apuntes\.html">Mis apuntes<\/a>/);
});

test("la vista de Mi nube publica los controles esenciales y solo acepta los tipos V1", () => {
  const idsEsenciales = [
    "cloudApp",
    "cloudSidebar",
    "cloudSearch",
    "cloudNewButton",
    "cloudNewMenu",
    "cloudFileInput",
    "cloudBreadcrumbs",
    "cloudSort",
    "cloudGridButton",
    "cloudListButton",
    "cloudItems",
    "cloudLoadMore",
    "cloudUsageBar",
    "cloudUsageText",
    "cloudUploadPanel",
    "cloudUploadQueue",
    "cloudDropOverlay",
    "cloudPreviewDialog",
    "cloudFolderDialog",
    "cloudRenameDialog",
    "cloudMoveDialog",
    "cloudStatus"
  ];
  idsEsenciales.forEach((id) => assertTieneId(miNubeHtml, id));

  for (const filtro of ["all", "files", "images", "pdf", "text", "notes", "trash"]) {
    assert.match(miNubeHtml, new RegExp(`data-cloud-filter=["']${filtro}["']`));
  }

  const accept = miNubeHtml.match(/id="cloudFileInput"[\s\S]*?accept="([^"]+)"/)?.[1];
  assert.ok(accept, "El selector de archivos debe declarar accept");
  assert.deepEqual(accept.split(","), [
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".txt", ".md",
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf", "text/plain", "text/markdown"
  ]);
  assert.doesNotMatch(accept, /\.(?:exe|zip|rar|apk|dmg|ps1|bat|sh|js|html)(?:,|$)/i);
  assert.match(miNubeHtml, /<script type="module" src="js\/mi-nube\.js\?v=20260822-mi-nube-v2-090"><\/script>/);
});

test("el puente consulta la colección actual de Mis apuntes y proyecta elementos sin cuota ni escrituras", () => {
  assert.match(apuntesControlador, /collection\(db,\s*"usuarios",\s*uidMedico,\s*"apuntesMedico"\)/);
  assert.match(puenteApuntes, /collection\(dbInstance,\s*"usuarios",\s*ownerId,\s*"apuntesMedico"\)/);
  assert.match(puenteApuntes, /collection\(dbInstance,\s*"usuarios",\s*ownerId,\s*"carpetasApuntes"\)/);
  assert.match(puenteApuntes, /sourceType:\s*"note"/);
  assert.match(puenteApuntes, /type:\s*"note"/);
  assert.match(puenteApuntes, /sizeBytes:\s*0/);
  assert.match(puenteApuntes, /quotaBytes:\s*0/);
  assert.match(puenteApuntes, /countsTowardCloudQuota:\s*false/);
  assert.match(puenteApuntes, /baseUrl\s*=\s*"apuntes\.html"/);
  assert.match(puenteApuntes, /nuevo:\s*"1"/);
  assert.match(puenteApuntes, /apunte:\s*id/);
  assert.match(miNubeControlador, /cargarProyeccionApuntesParaMiNube\(state\.uid/);
  assert.match(miNubeControlador, /crearUrlNuevoApunte\(\)/);
  assert.match(proyeccionApuntes, /sourceType:\s*"noteFolder"/);
  assert.match(proyeccionApuntes, /carpetaPadreId/);
  assert.match(proyeccionApuntes, /noteFolderId\s*\?\?\s*apunte\.carpetaId/);
  assert.match(miNubeControlador, /if \(isNoteFolder\) return "";/);
  assert.match(miNubeControlador, /data-cloud-source="\$\{isNote \? "note" : isNoteFolder \? "note-folder"/);
  assert.doesNotMatch(
    puenteApuntes,
    /\b(?:addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/,
    "Mi nube no debe crear una segunda fuente de verdad para apuntes"
  );
});

test("Storage restringe la ruta Mi nube al uid y exige una reserva exacta del backend", () => {
  assert.match(cloudConfig, /storageRoot:\s*"mi-nube"/);
  assert.match(cloudConfig, /filesSegment:\s*"files"/);
  assert.match(cloudConfig, /maxStorageBytes:\s*MAX_STORAGE_BYTES/);
  assert.match(
    cloudValidation,
    /`\$\{CLOUD_STORAGE_CONFIG\.storageRoot\}\/\$\{validUid\}\/\$\{CLOUD_STORAGE_CONFIG\.filesSegment\}\/\$\{validFileId\}\/\$\{validFilename\}`/
  );

  assert.match(storageRules, /match \/mi-nube\/\{uid\}\/files\/\{fileId\}\/\{filename\}/);
  assert.match(storageRules, /request\.auth\.uid == uid/);
  assert.match(storageRules, /cloudUploadReservations\/\$\(fileId\)/);
  assert.match(storageRules, /reservation\.data\.status == "reserved"/);
  assert.match(storageRules, /reservation\.data\.sizeBytes == request\.resource\.size/);
  assert.match(storageRules, /reservation\.data\.mimeType == request\.resource\.contentType/);
  assert.match(storageRules, /reservation\.data\.expiresAt > request\.time/);
  assert.match(storageRules, /request\.resource\.metadata\.ownerId == uid/);
  assert.match(storageRules, /request\.resource\.metadata\.fileId == fileId/);
  assert.doesNotMatch(storageRules, /allow\s+(?:read|write)(?:,\s*(?:read|write))*:\s*if\s+true/);
});

test("Firebase despliega el ruleset Firestore canónico recuperado y excluye Mi nube del wildcard heredado", () => {
  assert.equal(firebaseConfig.firestore?.rules, "firestore.rules");
  assert.equal(firebaseConfig.firestore?.indexes, "firestore.indexes.json");
  assert.equal(firebaseConfig.storage?.rules, "storage.rules");

  const snapshotSinLfFinal = firestoreRulesRecuperadas.replace(/\r?\n$/u, "");
  assert.equal(
    createHash("sha256").update(snapshotSinLfFinal, "utf8").digest("hex"),
    "9aa3c7767ec5c35d3875c170870f2b8b708db23eab35291b382b25feb31f4880",
    "La copia versionada debe conservar exactamente la fuente recuperada del Rules API"
  );
  assert.match(firestoreRulesRecuperadas, /Temporalmente abierto para depuración/);
  assert.match(firestoreRules, /service cloud\.firestore/);
  assert.match(firestoreRules, /match \/\{subcollection\}\/\{subdocument=\*\*\}/);

  for (const coleccion of ["cloudFiles", "cloudStorageUsage", "cloudUploadReservations"]) {
    assert.match(firestoreRules, new RegExp(`subcollection != ["']${coleccion}["']`));
  }

  for (const ruta of [
    "cloudFiles/{fileId}",
    "cloudStorageUsage/{usageId}",
    "cloudUploadReservations/{reservationId}"
  ]) {
    assert.match(firestoreRules, new RegExp(escaparRegExp(ruta)));
  }
  assert.match(firestoreRules, /usageId == "current"/);
  assert.match(firestoreRules, /match \/cloudUploadReservations\/\{reservationId\}[\s\S]*allow read, create, update, delete:\s*if false;/);
});

test("CORS versionado es una fusión mínima para getBlob y nunca usa wildcard", () => {
  assert.deepEqual(storageCors, [{
    origin: ["https://cognicionlabs.com"],
    method: ["GET", "HEAD"],
    responseHeader: ["Content-Type", "Content-Length", "Content-Disposition", "ETag"],
    maxAgeSeconds: 3600
  }]);
  assert.equal(JSON.stringify(storageCors).includes("*"), false);
  assert.match(storageCorsScript, /if \(-not \$Apply\)/);
  assert.match(storageCorsScript, /Get-BucketState/);
  assert.match(storageCorsScript, /--cors-file=\$temporaryFile/);
  assert.match(storageCorsScript, /CORS contiene un origen wildcard/);
  assert.match(storageCorsScript, /foreach \(\$entry in \$desiredDocument\) \{ \$desired \+= \$entry \}/);
  assert.doesNotMatch(storageCorsScript, /--clear-cors/);
});

test("Functions exporta todos los callables, triggers de Storage y reconciliación programada", () => {
  const callables = [
    "reserveCloudUpload",
    "confirmCloudUpload",
    "cancelCloudUpload",
    "createCloudFolder",
    "renameCloudItem",
    "moveCloudItem",
    "trashCloudItem",
    "restoreCloudItem",
    "permanentlyDeleteCloudItem",
    "reconcileCloudStorageUsage"
  ];
  const triggers = [
    "cloudFileFinalized",
    "cloudFileDeleted",
    "cleanupExpiredCloudReservations"
  ];

  assert.match(cloudHandlers, /request\.auth\?\.uid/);
  callables.forEach((nombre) => {
    assert.match(cloudHandlers, new RegExp(`const ${nombre} = onCall\\(`), `${nombre} no está declarado como callable`);
    assert.match(functionsIndex, new RegExp(`exports\\.${nombre} = cloudStorageFunctions\\.${nombre};`));
  });

  assert.match(cloudHandlers, /const cloudFileFinalized = onObjectFinalized\(/);
  assert.match(cloudHandlers, /const cloudFileDeleted = onObjectDeleted\(/);
  assert.match(cloudHandlers, /const cleanupExpiredCloudReservations = onSchedule\(/);
  triggers.forEach((nombre) => {
    assert.match(functionsIndex, new RegExp(`exports\\.${nombre} = cloudStorageFunctions\\.${nombre};`));
  });
});

test("el frontend usa blobs privados y no expone URLs permanentes ni integra Sofía", () => {
  const frontendMiNube = [
    miNubeHtml,
    miNubeControlador,
    miNubeCore,
    archivosService,
    cuotaService,
    previewService,
    previewCore,
    puenteApuntes
  ].join("\n");
  const normalizado = frontendMiNube.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

  assert.match(archivosService, /\{ getBlob, ref \}/);
  assert.match(archivosService, /return getBlob\(ref\(storage, storagePath\), maxDownloadBytes\)/);
  assert.match(previewCore, /mimeType === "application\/pdf" \|\| extension === "\.pdf"/);
  assert.match(previewCore, /URL\.createObjectURL/);
  assert.match(previewService, /kind === "text"[\s\S]*blob\.text\(\)/);
  assert.match(miNubeControlador, /<iframe|createElement\("iframe"\)/);
  assert.match(miNubeControlador, /revokeCloudPreviewUrl/);
  assert.doesNotMatch(frontendMiNube, /\bgetDownloadURL\b/);
  assert.doesNotMatch(normalizado, /\bsofia\b/);
  assert.doesNotMatch(normalizado, /\b(?:embedding|embeddings|openai|chatsofia)\b/);
  assert.doesNotMatch(clinicalAnalyticsConfig, /\b(?:cloudFiles|cloudUploadReservations|cloudStorageUsage)\b/);
  assert.match(
    clinicalAnalyticsHandlers,
    /!CLINICAL_RECORD_COLLECTIONS\.includes\(collectionId\)[\s\S]*return \{ skipped: true, reason: "unsupported_source" \}/,
    "El trigger clínico debe salir antes de leer o indexar cualquier colección de Mi nube"
  );
});

test("la entrega Mi nube conserva su marcador y una versión igual o posterior a 2.085", () => {
  assert.match(appVersion, /deployment marker:\s*2026-08-22-mi-nube-v1/);
  const version = appVersion.match(/APP_VERSION\s*=\s*"(\d+)\.(\d+)"/)?.slice(1).map(Number);
  assert.ok(version, "APP_VERSION debe conservar un formato numérico mayor.menor");
  const [major, minor] = version;
  assert.ok(major > 2 || (major === 2 && minor >= 85), `La versión ${major}.${minor} es anterior a 2.085`);
});

test("la corrección PDF y carpetas de apuntes publica versión y caché 2.090", () => {
  assert.match(appVersion, /deployment marker:\s*2026-08-22-mi-nube-preview-notes-folders-v1/);
  assert.match(appVersion, /APP_VERSION\s*=\s*"2\.090"/);
  assert.match(miNubeHtml, /js\/mi-nube\.js\?v=20260822-mi-nube-v2-090/);
  assert.match(miNubeControlador, /cloudPreviewService\.js\?v=20260822-mi-nube-v2-090/);
  assert.match(miNubeControlador, /notesCloudBridgeService\.js\?v=20260822-mi-nube-v2-090/);
});
