const { HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { selectUsefulLexicalPatterns } = require("./lexicalPatternQuality");

const ADMIN_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";
const ADMIN_ROLES = new Set(["admin", "administrador", "superadmin", "adminprincipal", "administradorprincipal"]);
const TEXT_COLLECTIONS = ["notasMedicas", "notas", "notasClinicas", "notasRapidas", "historiaClinica"];
const PATTERN_CONFIG = Object.freeze({ defaultThreshold: 3, minimumThreshold: 2, maximumThreshold: 1000, minimumTokens: 2, maximumTokens: 8, batchSize: 25, initialBatchSize: 10, pageSize: 50, maximumDocuments: 10000, maximumResults: 250 });
const META_KEYS = /^(id|uid|uuid|path|ruta|url|email|correo|telefono|tel|curp|rfc|timestamp|createdat|updatedat|fecha|hora|version|estado|rol|sexo|edad|nombre|apellido|expediente|pacienteid|pacienteuid|medicouid|institucionid)$/i;

function roleIsAdmin(value = "") {
  return ADMIN_ROLES.has(String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, "").trim());
}

async function assertAdmin(request, db, trace) {
  console.log("[PATTERNS][AUTH]", { authenticated: Boolean(request.auth), uid: request.auth?.uid ?? null, tokenRole: request.auth?.token?.role ?? null, tokenAdmin: request.auth?.token?.admin ?? null });
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  const claims = request.auth.token || {};
  if (request.auth.uid === ADMIN_UID || claims.admin === true || roleIsAdmin(claims.role) || roleIsAdmin(claims.rol)) { console.log("[PATTERNS][FUNCTION] Rol admin confirmado"); trace?.("rol_confirmado"); return request.auth.uid; }
  let snap;
  try { snap = await db.doc(`usuarios/${request.auth.uid}`).get(); } catch (error) { throw mapReadError(error, "autenticacion_rol"); }
  const datos = snap.exists ? snap.data() : {};
  const roles = Array.isArray(datos.roles) ? datos.roles : Object.entries(datos.roles || {}).filter(([, activo]) => activo).map(([rol]) => rol);
  if (roleIsAdmin(datos.rol) || roleIsAdmin(datos.role) || roles.some(roleIsAdmin) || datos.admin === true || datos.esAdmin === true || datos.isAdmin === true) { console.log("[PATTERNS][FUNCTION] Rol admin confirmado"); trace?.("rol_confirmado"); return request.auth.uid; }
  throw new HttpsError("permission-denied", "Acceso exclusivo para administradores.", { stage: "autenticacion_rol" });
}

function mapReadError(error, stage) {
  if (error instanceof HttpsError) return error;
  const originalCode = error?.code ?? null;
  const codeText = String(originalCode || "").toLowerCase();
  const code = codeText.includes("permission") || originalCode === 7 ? "permission-denied" : codeText.includes("failed-precondition") || originalCode === 9 ? "failed-precondition" : codeText.includes("not-found") || originalCode === 5 ? "not-found" : codeText.includes("unavailable") || originalCode === 14 ? "unavailable" : codeText.includes("deadline") || originalCode === 4 ? "deadline-exceeded" : "internal";
  if (code !== "internal") return new HttpsError(code, error?.message || code, { stage });
  return new HttpsError("internal", "PATTERN_READ_FAILED", { stage, originalCode, originalMessage: error?.message ?? null });
}

function normalize(text = "") {
  return String(text).replace(/<[^>]*>/g, " ").replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(text) { return normalize(text).split(/\s+/).filter((token) => token.length > 1 && !/^\d+$/.test(token)); }

function collectTexts(value, path = "", result = []) {
  if (typeof value === "string") {
    const key = path.split(".").pop() || "";
    if (!META_KEYS.test(key) && value.trim()) result.push({ campo: path, texto: value });
  } else if (Array.isArray(value)) value.forEach((item, index) => collectTexts(item, `${path}[${index}]`, result));
  else if (value && typeof value === "object" && typeof value.toDate !== "function" && typeof value.seconds !== "number") {
    Object.entries(value).forEach(([key, item]) => { if (!META_KEYS.test(key)) collectTexts(item, path ? `${path}.${key}` : key, result); });
  }
  return result;
}

function anonymize(text = "") { return String(text).replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[dato omitido]").replace(/\+?\d[\d\s().-]{7,}/g, "[dato omitido]").replace(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}\b/g, "[persona]"); }

function asIso(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (value && typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function metadata(data, patientUid) {
  return { fecha: asIso(data.fechaUltimaModificacion || data.fechaEdicion || data.fecha || data.fechaCreacion || data.createdAt), pacienteUid: data.uidPaciente || data.pacienteUid || data.idPaciente || patientUid || "", medicoUid: data.uidMedico || data.medicoUid || data.usuarioId || "", institucion: data.institucion || data.institucionNombre || data.unidad || "", servicio: data.servicio || data.tipoAtencion || "", diagnostico: Array.isArray(data.diagnosticos) ? data.diagnosticos.map((item) => typeof item === "string" ? item : item?.nombre || item?.descripcion || "").join(", ") : String(data.diagnostico || "") };
}

function matches(meta, filters = {}) {
  return (!filters.medico || meta.medicoUid === filters.medico) && (!filters.paciente || meta.pacienteUid === filters.paciente) && (!filters.institucion || meta.institucion === filters.institucion) && (!filters.servicio || meta.servicio === filters.servicio) && (!filters.desde || meta.fecha >= filters.desde) && (!filters.hasta || meta.fecha <= `${filters.hasta}T23:59:59.999Z`);
}

function add(map, key, item) {
  let row = map.get(key);
  if (!row) row = { clave: item.clave, tipo: item.tipo, n: item.n, frecuencia: 0, notas: new Set(), pacientes: new Set(), medicos: new Set(), primeraAparicion: item.fecha, ultimaAparicion: item.fecha };
  row.frecuencia++;
  if (item.notaId) row.notas.add(item.notaId);
  if (item.pacienteUid) row.pacientes.add(item.pacienteUid);
  if (item.medicoUid) row.medicos.add(item.medicoUid);
  if (item.fecha && (!row.primeraAparicion || item.fecha < row.primeraAparicion)) row.primeraAparicion = item.fecha;
  if (item.fecha > row.ultimaAparicion) row.ultimaAparicion = item.fecha;
  map.set(key, row);
}

async function discoverTextPatterns({ request, db }) {
  const inicio = Date.now();
  let currentStage = "inicio";
  let readOperations = 0;
  let documentsRead = 0;
  let firstBatchSize = 0;
  let firstBatchReceived = false;
  const trace = (stage) => console.log("[PATTERNS][TIME]", { stage, elapsedMs: Date.now() - inicio });
  try {
    console.log("[PATTERNS][FUNCTION] Inicio");
    trace("inicio");
    currentStage = "autenticacion_rol";
    const adminUid = await assertAdmin(request, db, trace);
    console.log("[PATTERNS][FUNCTION] Usuario autenticado", { uid: adminUid });
    trace("autenticacion");
    const filters = request.data?.filtros || {};
    const requestedThreshold = Number(request.data?.threshold);
    const threshold = Number.isInteger(requestedThreshold) && requestedThreshold >= PATTERN_CONFIG.minimumThreshold && requestedThreshold <= PATTERN_CONFIG.maximumThreshold
      ? requestedThreshold
      : PATTERN_CONFIG.minimumThreshold;
    const rows = new Map();
    let totalNotas = 0;
    let batchesProcessed = 0;
    const initialBatchOnly = request.data?.initialBatchOnly !== false;
    let hasMore = false;
    let documentLimitReached = false;
    const shouldStop = () => documentLimitReached || (initialBatchOnly && totalNotas >= PATTERN_CONFIG.initialBatchSize);
    let lastUser = null;
    do {
      currentStage = "consulta_inicial";
      let usersQuery = db.collection("usuarios").orderBy(admin.firestore.FieldPath.documentId()).limit(PATTERN_CONFIG.initialBatchSize);
      if (lastUser) usersQuery = usersQuery.startAfter(lastUser);
      console.log("[PATTERNS][FUNCTION] Preparando consulta", { collection: "usuarios", limit: PATTERN_CONFIG.initialBatchSize });
      trace("consulta_creada");
      const usuarios = await usersQuery.get();
      readOperations++;
      documentsRead += usuarios.size;
      if (!firstBatchReceived && usuarios.size > 0) { firstBatchReceived = true; firstBatchSize = usuarios.size; console.log("[PATTERNS][FUNCTION] Primer lote recibido", { size: usuarios.size }); trace("snapshot_recibido"); }
      for (const usuario of usuarios.docs) {
        const perfil = usuario.data() || {};
        for (const collectionName of TEXT_COLLECTIONS) {
          let lastDoc = null;
          while (true) {
            currentStage = "consulta_inicial";
            const limit = lastDoc ? PATTERN_CONFIG.batchSize : PATTERN_CONFIG.initialBatchSize;
            let query = db.collection(`usuarios/${usuario.id}/${collectionName}`).orderBy(admin.firestore.FieldPath.documentId()).limit(limit);
            if (lastDoc) query = query.startAfter(lastDoc);
            console.log("[PATTERNS][FUNCTION] Ejecutando primer lote", { collection: collectionName, limit });
            trace("consulta_enviada");
            const snapshot = await query.get();
            readOperations++;
            documentsRead += snapshot.size;
            if (!firstBatchReceived && snapshot.size > 0) { firstBatchReceived = true; firstBatchSize = snapshot.size; console.log("[PATTERNS][FUNCTION] Primer lote recibido", { size: snapshot.size }); trace("snapshot_recibido"); }
            batchesProcessed++;
            for (const note of snapshot.docs) {
              if (totalNotas >= PATTERN_CONFIG.maximumDocuments) {
                documentLimitReached = true;
                hasMore = true;
                break;
              }
              totalNotas++;
              const data = note.data() || {};
              const meta = metadata(data, perfil.rol === "paciente" ? usuario.id : "");
              if (!matches(meta, filters)) continue;
              const notaId = `usuarios:${usuario.id}:${collectionName}:${note.id}`;
              for (const source of collectTexts(data)) {
                const words = tokens(anonymize(source.texto));
                for (let n = PATTERN_CONFIG.minimumTokens; n <= Math.min(PATTERN_CONFIG.maximumTokens, words.length); n++) for (let i = 0; i <= words.length - n; i++) {
                  const tipo = n === 1 ? "word" : n === 2 ? "bigram" : n === 3 ? "trigram" : "phrase";
                  const clave = words.slice(i, i + n).join(" ");
                  add(rows, `${tipo}:${clave}`, { ...meta, notaId, campo: source.campo, tipo, n, clave });
                }
              }
              if (shouldStop()) { hasMore = true; break; }
            }
            if (shouldStop()) break;
            if (snapshot.size < limit) break;
            lastDoc = snapshot.docs[snapshot.docs.length - 1];
          }
          if (shouldStop()) break;
        }
        if (shouldStop()) break;
      }
      if (shouldStop()) break;
      lastUser = usuarios.docs[usuarios.docs.length - 1] || null;
    } while (lastUser && !initialBatchOnly);
    const temporaryCandidates = rows.size;
    const quality = selectUsefulLexicalPatterns([...rows.values()], {
      threshold,
      maxResults: PATTERN_CONFIG.maximumResults
    });
    const patterns = quality.patterns.filter((row) => !filters.busqueda || `${row.phrase} ${row.normalizedPhrase}`.includes(String(filters.busqueda).toLowerCase()));
    currentStage = "respuesta";
    await db.collection("auditoria").add({ accion: "analizar_patrones_texto", modulo: "Explorador de patrones lexicos", usuarioUid: adminUid, filtrosAplicados: { busqueda: Boolean(filters.busqueda), medico: Boolean(filters.medico), paciente: Boolean(filters.paciente), institucion: Boolean(filters.institucion), servicio: Boolean(filters.servicio), periodo: Boolean(filters.desde || filters.hasta) }, umbral: threshold, cantidadResultados: patterns.length, totalNotas, duracionMs: Date.now() - inicio, fecha: new Date().toISOString(), exito: true });
    const response = { ok: true, patterns, stats: { documentsProcessed: totalNotas, batchesProcessed, temporaryCandidates, confirmedPatterns: patterns.length, threshold, elapsedMs: Date.now() - inicio, firstBatchSize, readOperations, documentsRead, hasMore, documentLimitReached, ...quality.stats } };
    try { JSON.stringify(response); } catch (error) { throw new HttpsError("internal", "PATTERN_RESPONSE_SERIALIZATION_FAILED", { stage: "serializacion", originalCode: error?.code ?? null, originalMessage: error?.message ?? null }); }
    trace("serializacion");
    trace("respuesta_enviada");
    return response;
  } catch (error) {
    console.error("[PATTERNS][FUNCTION] Fallo", { stage: currentStage, error: error?.stack || error });
    throw mapReadError(error, currentStage);
  }
}

module.exports = { asIso, discoverTextPatterns };
