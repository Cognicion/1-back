const { HttpsError } = require("firebase-functions/v2/https");

const ADMIN_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";
const ADMIN_ROLES = new Set(["admin", "administrador", "superadmin", "adminprincipal", "administradorprincipal"]);
const TEXT_COLLECTIONS = ["notasMedicas", "notas", "notasClinicas", "notasRapidas", "historiaClinica"];
const META_KEYS = /^(id|uid|uuid|path|ruta|url|email|correo|telefono|tel|curp|rfc|timestamp|createdat|updatedat|fecha|hora|version|estado|rol|sexo|edad|nombre|apellido|expediente|pacienteid|pacienteuid|medicouid|institucionid)$/i;

function roleIsAdmin(value = "") {
  return ADMIN_ROLES.has(String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, "").trim());
}

async function assertAdmin(request, db) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  const claims = request.auth.token || {};
  if (request.auth.uid === ADMIN_UID || claims.admin === true || roleIsAdmin(claims.role) || roleIsAdmin(claims.rol)) return request.auth.uid;
  const snap = await db.doc(`usuarios/${request.auth.uid}`).get();
  const datos = snap.exists ? snap.data() : {};
  const roles = Array.isArray(datos.roles) ? datos.roles : Object.entries(datos.roles || {}).filter(([, activo]) => activo).map(([rol]) => rol);
  if (roleIsAdmin(datos.rol) || roleIsAdmin(datos.role) || roles.some(roleIsAdmin) || datos.admin === true || datos.esAdmin === true || datos.isAdmin === true) return request.auth.uid;
  throw new HttpsError("permission-denied", "Acceso exclusivo para administradores.");
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
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (value && typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function metadata(data, patientUid) {
  return { fecha: asIso(data.fechaUltimaModificacion || data.fechaEdicion || data.fecha || data.fechaCreacion || data.createdAt), pacienteUid: data.uidPaciente || data.pacienteUid || data.idPaciente || patientUid || "", medicoUid: data.uidMedico || data.medicoUid || data.usuarioId || "", institucion: data.institucion || data.institucionNombre || data.unidad || "", servicio: data.servicio || data.tipoAtencion || "", diagnostico: Array.isArray(data.diagnosticos) ? data.diagnosticos.map((item) => typeof item === "string" ? item : item?.nombre || item?.descripcion || "").join(", ") : String(data.diagnostico || "") };
}

function matches(meta, filters = {}) {
  const haystack = `${meta.institucion} ${meta.servicio} ${meta.diagnostico}`.toLowerCase();
  return (!filters.medico || meta.medicoUid === filters.medico) && (!filters.paciente || meta.pacienteUid === filters.paciente) && (!filters.institucion || meta.institucion === filters.institucion) && (!filters.servicio || meta.servicio === filters.servicio) && (!filters.desde || meta.fecha >= filters.desde) && (!filters.hasta || meta.fecha <= `${filters.hasta}T23:59:59.999Z`) && (!filters.busqueda || haystack.includes(String(filters.busqueda).toLowerCase()));
}

function add(map, key, item) {
  let row = map.get(key);
  if (!row) row = { clave: item.clave, tipo: item.tipo, n: item.n, frecuencia: 0, notas: new Set(), pacientes: new Set(), medicos: new Set(), ejemplos: [], primeraAparicion: item.fecha, ultimaAparicion: item.fecha, porDiagnostico: new Map(), porAnio: new Map() };
  row.frecuencia++;
  if (item.notaId) row.notas.add(item.notaId);
  if (item.pacienteUid) row.pacientes.add(item.pacienteUid);
  if (item.medicoUid) row.medicos.add(item.medicoUid);
  if (item.fecha && (!row.primeraAparicion || item.fecha < row.primeraAparicion)) row.primeraAparicion = item.fecha;
  if (item.fecha > row.ultimaAparicion) row.ultimaAparicion = item.fecha;
  const diagnosis = item.diagnostico || "Sin diagnostico";
  row.porDiagnostico.set(diagnosis, (row.porDiagnostico.get(diagnosis) || 0) + 1);
  const year = item.fecha ? item.fecha.slice(0, 4) : "Sin fecha";
  row.porAnio.set(year, (row.porAnio.get(year) || 0) + 1);
  if (row.ejemplos.length < 3 && item.ejemplo) row.ejemplos.push({ texto: item.ejemplo, contexto: item.campo });
  map.set(key, row);
}

async function discoverTextPatterns({ request, db }) {
  const adminUid = await assertAdmin(request, db);
  const inicio = Date.now();
  const filters = request.data?.filtros || {};
  const limit = Math.min(Math.max(Number(request.data?.limite || 500), 1), 500);
  const usuarios = await db.collection("usuarios").get();
  const rows = new Map();
  let totalNotas = 0;
  for (const usuario of usuarios.docs) {
    const perfil = usuario.data() || {};
    for (const collectionName of TEXT_COLLECTIONS) {
      let snapshot;
      try { snapshot = await db.collection(`usuarios/${usuario.id}/${collectionName}`).get(); } catch { continue; }
      for (const note of snapshot.docs) {
        totalNotas++;
        const data = note.data() || {};
        const meta = metadata(data, perfil.rol === "paciente" ? usuario.id : "");
        if (!matches(meta, filters)) continue;
        const notaId = `usuarios:${usuario.id}:${collectionName}:${note.id}`;
        for (const source of collectTexts(data)) {
          const words = tokens(source.texto);
          const example = anonymize(source.texto);
          for (let n = 1; n <= Math.min(20, words.length); n++) for (let i = 0; i <= words.length - n; i++) {
            const tipo = n === 1 ? "word" : n === 2 ? "bigram" : n === 3 ? "trigram" : "phrase";
            const clave = words.slice(i, i + n).join(" ");
            add(rows, `${tipo}:${clave}`, { ...meta, notaId, campo: source.campo, ejemplo, tipo, n, clave });
          }
        }
      }
    }
  }
  const filas = [...rows.values()].map((row) => ({ ...row, notas: row.notas.size, pacientes: row.pacientes.size, medicos: row.medicos.size, ejemplos: row.ejemplos, porDiagnostico: Object.fromEntries(row.porDiagnostico), porAnio: Object.fromEntries(row.porAnio) })).sort((a, b) => b.frecuencia - a.frecuencia || a.clave.localeCompare(b.clave)).slice(0, limit);
  await db.collection("auditoria").add({ accion: "consultar_patrones_texto", modulo: "Motor de Descubrimiento de Patrones", usuarioUid: adminUid, filtros: { ...filters }, cantidadResultados: filas.length, totalNotas, duracionMs: Date.now() - inicio, fecha: new Date().toISOString(), exito: true });
  return { filas, totalNotas };
}

module.exports = { discoverTextPatterns };
