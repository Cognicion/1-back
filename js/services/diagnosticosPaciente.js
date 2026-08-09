const ESTADO_ACTIVO = "activo";
const ESTADO_DESCARTADO = "descartado";

function normalizarTexto(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function codigoDiagnostico(value = "") {
  if (typeof value === "string") return value.trim().toUpperCase();
  return String(value?.code || value?.codigo || "").trim().toUpperCase();
}

function codigosDiagnostico(diagnostico = {}) {
  return [...new Set([
    diagnostico.codigo,
    diagnostico.code,
    ...(Array.isArray(diagnostico.codes) ? diagnostico.codes : [])
  ].map(codigoDiagnostico).filter(Boolean))];
}

function normalizarFechaClinica(value = "") {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (local) return `${local[3]}-${local[2]}-${local[1]}`;
  return "";
}

function normalizarHoraClinica(value = "") {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function estadoClinicoCanonico(candidate = {}) {
  const raw = String(candidate.statusSuggestion || candidate.status || candidate.estadoClinico || "Confirmado").trim();
  const key = normalizarTexto(raw);
  const values = {
    "se agrega": "Se agrega",
    "se descarta": "Se descarta",
    descartado: "Se descarta",
    negado: "Se descarta",
    probable: "Probable",
    "a descartar": "A descartar",
    confirmado: "Confirmado",
    "en seguimiento": "En seguimiento",
    antecedente: "Antecedente",
    remision: "Remisión",
    diferencial: "Diferencial"
  };
  return values[key] || raw || "Confirmado";
}

function shortHash(value = "") {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function claveDiagnosticoPaciente(diagnostico = {}) {
  const codes = codigosDiagnostico(diagnostico);
  const catalogo = diagnostico.catalogo || diagnostico.codingSystem || diagnostico.system || "";
  const nombre = diagnostico.nombre || diagnostico.normalizedLabel || diagnostico.diagnosisName || diagnostico.texto || diagnostico.rawText || "";
  return [normalizarTexto(catalogo), normalizarTexto(codes[0] || ""), normalizarTexto(nombre)]
    .map((value) => value.replace(/\s+/g, ""))
    .filter(Boolean)
    .join(":");
}

export function construirRegistroDiagnosticoImportado(candidate = {}, context = {}) {
  const codes = codigosDiagnostico(candidate);
  const codigo = codes[0] || "";
  const catalogo = candidate.codingSystem || candidate.system || "";
  const nombre = String(candidate.normalizedLabel || candidate.diagnosisName || candidate.rawText || "").trim();
  const texto = String(candidate.rawText || candidate.sourceText || nombre).trim();
  const estadoClinico = estadoClinicoCanonico(candidate);
  const negated = candidate.negated === true || ["se descarta", "descartado", "negado"].includes(normalizarTexto(estadoClinico));
  const fechaClinica = normalizarFechaClinica(context.date || candidate.date || "");
  const fecha = fechaClinica || new Date().toISOString().slice(0, 10);
  const hora = normalizarHoraClinica(context.time || candidate.time || "");
  const sourceIdentity = [context.sourceFileHash, context.sourceNoteId, candidate.id || context.index]
    .filter(Boolean)
    .join(":");
  const importCandidateKey = claveDiagnosticoPaciente({ catalogo, codigo, codes, nombre, texto });
  const fechaSeleccion = fechaClinica
    ? `${fecha}T${hora || "00:00"}:00`
    : new Date().toISOString();

  return {
    id: `imported-${shortHash(`${sourceIdentity}:${importCandidateKey}`)}`,
    codigo,
    codes,
    catalogo,
    nombre: nombre || texto || "Diagnóstico importado",
    texto: texto || nombre,
    fecha,
    fechaSeleccion,
    estado: negated ? ESTADO_DESCARTADO : ESTADO_ACTIVO,
    estadoClinico,
    orden: Number.isFinite(Number(context.order)) ? Number(context.order) : Number(context.index) || 0,
    principal: Boolean(candidate.principal || candidate.isPrimary),
    manual: false,
    agregadoManual: false,
    editadoManual: false,
    incluidoEnCatalogo: false,
    notas: `Importado desde DOCX: ${context.fileName || ""}`.trim(),
    fuenteImportacionDocx: true,
    imported: true,
    transferOperationId: context.transferOperationId || "",
    sourceFileHash: context.sourceFileHash || "",
    sourceNoteId: context.sourceNoteId || "",
    sourceDocumentName: context.fileName || "",
    importCandidateKey,
    importSourceIdentity: sourceIdentity,
    sourceSection: candidate.sourceSection || "",
    sourceLocation: candidate.sourceLocation || null,
    temporality: candidate.temporality || (estadoClinico === "Antecedente" ? "historical" : "current"),
    codeEvidence: Array.isArray(candidate.codeEvidence) ? candidate.codeEvidence : [],
    evidence: candidate.evidence || null,
    parser: candidate.parser || "",
    parserVersion: candidate.parserVersion || "",
    confirmedByDoctor: true
  };
}

export function fusionarDiagnosticosImportados(historial = [], candidates = [], context = {}) {
  const current = Array.isArray(historial) ? [...historial] : [];
  const selected = candidates.filter((candidate) => candidate.selectedForImport === true || candidate.include === true);
  const seen = new Set(current.map((item) => item.importCandidateKey || claveDiagnosticoPaciente(item)).filter(Boolean));
  const created = [];
  const existing = [];
  const expectedKeys = [];

  selected.forEach((candidate, index) => {
    const key = claveDiagnosticoPaciente(candidate);
    if (!key) return;
    expectedKeys.push(key);
    if (seen.has(key)) {
      existing.push({ candidateId: candidate.id || "", key });
      return;
    }
    const payload = construirRegistroDiagnosticoImportado(candidate, {
      ...context,
      index,
      order: current.length + created.length
    });
    seen.add(key);
    created.push(payload);
    current.push(payload);
  });

  return {
    historial: current,
    selected,
    created,
    existing,
    expectedKeys: [...new Set(expectedKeys)],
    omitted: Math.max(0, candidates.length - created.length - existing.length)
  };
}

export function construirActualizacionHistorialDiagnosticos(paciente = {}, historial = [], updatedAt = new Date().toISOString()) {
  const limpio = Array.isArray(historial) ? historial : [];
  const diagnosticoPrincipal = limpio.find((item) => item?.estado !== ESTADO_DESCARTADO) || null;
  return {
    diagnostico: diagnosticoPrincipal,
    historialDiagnosticos: limpio,
    datosClinicosResumen: {
      ...(paciente?.datosClinicosResumen || {}),
      diagnostico: diagnosticoPrincipal,
      historialDiagnosticos: limpio,
      fechaActualizacionDiagnosticos: updatedAt
    }
  };
}
