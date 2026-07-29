const CAMPOS_SIGNOS_NOTA = Object.freeze({
  presionArterial: "presionArterial",
  frecuenciaCardiaca: "frecuenciaCardiaca",
  frecuenciaRespiratoria: "frecuenciaRespiratoria",
  temperatura: "temperatura",
  saturacionO2: "saturacionO2",
  peso: "peso",
  talla: "talla",
  imc: "imc"
});

function valorEstructurado(valor) {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor).trim();
  return texto && texto !== "-" ? texto : "";
}

function resolverFechaClinicaNota(nota = {}) {
  const observacion = nota.observacionFray || {};
  const fecha = valorEstructurado(observacion.fechaNota || nota.fechaNota || nota.fecha);
  const hora = valorEstructurado(observacion.horaNota || nota.horaNota || "00:00");
  if (!fecha) return new Date().toISOString();
  const fechaLocal = new Date(`${fecha}T${hora || "00:00"}`);
  return Number.isNaN(fechaLocal.getTime()) ? new Date().toISOString() : fechaLocal.toISOString();
}

export function extraerSignosVitalesEstructuradosDeNota(nota = {}) {
  const observacion = nota.observacionFray || {};
  const valores = Object.fromEntries(Object.entries(CAMPOS_SIGNOS_NOTA)
    .map(([campo, clave]) => [campo, valorEstructurado(observacion[clave] ?? nota[clave])])
    .filter(([, valor]) => valor));
  return valores;
}

export function construirActualizacionSignosVitalesDesdeNota({ paciente = {}, nota = {}, sourceNoteId = "", createdBy = "" } = {}) {
  const noteId = String(sourceNoteId || "").trim();
  const valores = extraerSignosVitalesEstructuradosDeNota(nota);
  if (!noteId || !Object.keys(valores).length) return null;
  const takenAt = resolverFechaClinicaNota(nota);
  const historial = Object.fromEntries(Object.entries(paciente.historialSignosVitales || {}).map(([clave, registros]) => [clave, Array.isArray(registros) ? [...registros] : []]));
  const registroBase = {
    sourceType: "clinical_note",
    sourceNoteId: noteId,
    takenAt,
    fecha: takenAt,
    fechaToma: takenAt,
    createdAt: new Date().toISOString(),
    createdBy: String(createdBy || ""),
    uidRegistro: String(createdBy || ""),
    values: valores
  };
  for (const [clave, valor] of Object.entries(valores)) {
    const registros = historial[clave] || [];
    const indice = registros.findIndex((registro) => String(registro?.sourceNoteId || "") === noteId);
    const previo = indice >= 0 ? registros[indice] : null;
    const registro = { ...registroBase, createdAt: previo?.createdAt || registroBase.createdAt, updatedAt: new Date().toISOString(), valor, nota: `Nota clínica ${noteId}` };
    if (indice >= 0) registros[indice] = { ...previo, ...registro };
    else registros.push(registro);
    historial[clave] = registros;
  }
  const actualizacion = { historialSignosVitales: historial };
  const signosVitales = { ...(paciente.signosVitales || {}) };
  const somatometria = { ...(paciente.somatometria || {}) };
  const datosInstitucionales = { ...(paciente.datosInstitucionales || {}) };
  for (const [clave, valor] of Object.entries(valores)) {
    signosVitales[clave] = valor;
    datosInstitucionales[clave] = valor;
    if (["peso", "talla", "imc"].includes(clave)) somatometria[clave] = valor;
    actualizacion[clave] = valor;
  }
  actualizacion.signosVitales = signosVitales;
  actualizacion.somatometria = somatometria;
  actualizacion.datosInstitucionales = datosInstitucionales;
  return actualizacion;
}
