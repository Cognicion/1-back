import { calcularIMC } from "../utils/imc.js";

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

const CAMPOS_SIGNOS_EXPORTACION = Object.freeze({
  presionArterial: ["presionArterial", "pa", "bloodPressure"],
  frecuenciaCardiaca: ["frecuenciaCardiaca", "fc", "heartRate"],
  frecuenciaRespiratoria: ["frecuenciaRespiratoria", "fr", "respiratoryRate"],
  temperatura: ["temperatura", "temperature"],
  saturacionOxigeno: ["saturacionOxigeno", "saturacionO2", "spo2", "oxygenSaturation"],
  peso: ["peso", "weight"],
  talla: ["talla", "height"],
  imc: ["imc", "bmi"],
  glucosa: ["glucosa", "glucose", "glucemia"]
});

const CLAVE_HISTORIAL_SIGNO = Object.freeze({
  saturacionOxigeno: "saturacionO2"
});

const CAMPOS_VITALES_EXPEDIENTE = new Set([
  "presionArterial",
  "frecuenciaCardiaca",
  "frecuenciaRespiratoria",
  "temperatura",
  "saturacionO2"
]);

function valorEstructurado(valor) {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor).trim();
  return texto && texto !== "-" ? texto : "";
}

function valorSignoExportable(valor) {
  if (valor && typeof valor === "object" && "valor" in valor) {
    return valorSignoExportable(valor.valor);
  }
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number" && !Number.isFinite(valor)) return "";
  const texto = String(valor).trim();
  return texto && texto !== "-" && !/^(undefined|null|nan|infinity)$/i.test(texto) ? valor : "";
}

function primerValor(fuentes = [], aliases = []) {
  for (const fuente of fuentes) {
    if (!fuente || typeof fuente !== "object") continue;
    for (const alias of aliases) {
      const valor = valorSignoExportable(fuente[alias]);
      if (valor !== "") return valor;
    }
  }
  return "";
}

function registroVinculado(paciente = {}, clave = "", aliases = [], sourceNoteId = "") {
  if (!sourceNoteId) return null;
  const claves = [...new Set([CLAVE_HISTORIAL_SIGNO[clave] || clave, ...aliases])];
  for (const claveHistorial of claves) {
    const registros = paciente.historialSignosVitales?.[claveHistorial];
    if (!Array.isArray(registros)) continue;
    const registro = registros.find((item) => String(item?.sourceNoteId || "") === sourceNoteId);
    if (registro) return registro;
  }
  return null;
}

function numeroClinico(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const coincidencia = String(valor ?? "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!coincidencia) return null;
  const numero = Number(coincidencia[0]);
  return Number.isFinite(numero) ? numero : null;
}

function partesFechaLocal(fecha, hora = "") {
  if (!fecha) return { fechaToma: "", horaToma: valorEstructurado(hora) || "" };
  if (typeof fecha.toDate === "function") return partesFechaLocal(fecha.toDate(), hora);
  if (typeof fecha.seconds === "number") return partesFechaLocal(new Date(fecha.seconds * 1000), hora);

  const texto = String(fecha).trim();
  const isoLocal = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (isoLocal) {
    return {
      fechaToma: `${isoLocal[1]}-${isoLocal[2]}-${isoLocal[3]}`,
      horaToma: valorEstructurado(hora) || (isoLocal[4] ? `${isoLocal[4]}:${isoLocal[5]}` : "")
    };
  }
  const fechaLatina = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[T\s](\d{2}):(\d{2}))?/);
  if (fechaLatina) {
    return {
      fechaToma: `${fechaLatina[3]}-${fechaLatina[2]}-${fechaLatina[1]}`,
      horaToma: valorEstructurado(hora) || (fechaLatina[4] ? `${fechaLatina[4]}:${fechaLatina[5]}` : "")
    };
  }

  const objeto = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(objeto.getTime())) return { fechaToma: "", horaToma: valorEstructurado(hora) || "" };
  const pad = (valor) => String(valor).padStart(2, "0");
  return {
    fechaToma: `${objeto.getFullYear()}-${pad(objeto.getMonth() + 1)}-${pad(objeto.getDate())}`,
    horaToma: valorEstructurado(hora) || `${pad(objeto.getHours())}:${pad(objeto.getMinutes())}`
  };
}

export function resolverSignosVitalesNota(nota = {}, opciones = {}) {
  const paciente = opciones.paciente || {};
  const sourceNoteId = String(
    opciones.sourceNoteId || nota.id || nota.notaId || nota.sourceNoteId || ""
  ).trim();
  const observacion = nota.observacionFray || {};
  const fuentesEstructuradas = [
    nota.signosVitales,
    observacion.signosVitales,
    observacion,
    nota.vitales,
    nota.signosVitalesVinculados
  ];
  const registroVinculadoEnNota = Object.values(nota.signosVitalesVinculados || {})
    .find((registro) => registro && typeof registro === "object") || null;
  const fuentesHistoricas = [
    nota.datosVitales,
    nota.somatometria,
    nota.datosInstitucionales,
    nota
  ];
  const salida = {};
  let registroFecha = null;

  Object.entries(CAMPOS_SIGNOS_EXPORTACION).forEach(([clave, aliases]) => {
    let valor = primerValor(fuentesEstructuradas, aliases);
    if (valor === "") {
      const registro = registroVinculado(paciente, clave, aliases, sourceNoteId);
      if (registro) {
        valor = primerValor([registro.values, registro], aliases) || valorSignoExportable(registro.valor);
        registroFecha ||= registro;
      }
    }
    if (valor === "") valor = primerValor(fuentesHistoricas, aliases);
    if (valor !== "") salida[clave] = valor;
  });

  if (salida.imc === undefined && salida.peso !== undefined && salida.talla !== undefined) {
    const peso = numeroClinico(salida.peso);
    const tallaCapturada = numeroClinico(salida.talla);
    const tallaMetros = tallaCapturada && tallaCapturada > 3 ? tallaCapturada / 100 : tallaCapturada;
    const imc = calcularIMC(peso, tallaMetros);
    if (imc !== null) salida.imc = imc;
  }

  const tieneSignos = Object.keys(salida).length > 0;
  if (!tieneSignos) return null;

  const fechaEstructurada = nota.signosVitales?.takenAt
    || nota.signosVitales?.fechaToma
    || nota.takenAt
    || nota.fechaToma
    || registroVinculadoEnNota?.takenAt
    || registroVinculadoEnNota?.fechaToma
    || registroFecha?.takenAt
    || registroFecha?.fechaToma
    || observacion.fechaNota
    || nota.fechaNotaInput
    || nota.fechaNota
    || nota.fecha
    || "";
  const horaEstructurada = nota.signosVitales?.horaToma
    || nota.horaToma
    || registroVinculadoEnNota?.horaToma
    || registroFecha?.horaToma
    || observacion.horaNota
    || nota.horaNota
    || "";
  const fechaHora = partesFechaLocal(fechaEstructurada, horaEstructurada);

  return {
    ...salida,
    fechaToma: fechaHora.fechaToma,
    horaToma: fechaHora.horaToma
  };
}

function resolverFechaClinicaNota(nota = {}) {
  const observacion = nota.observacionFray || {};
  const fecha = valorEstructurado(observacion.fechaNota || nota.fechaNota || nota.fecha);
  const hora = valorEstructurado(observacion.horaNota || nota.horaNota || "00:00");
  const partes = partesFechaLocal(fecha, hora);
  if (!partes.fechaToma) return new Date().toISOString();
  const horaNormalizada = String(partes.horaToma || "00:00").match(/^(\d{1,2}):(\d{2})$/);
  const horaClinica = horaNormalizada
    ? `${horaNormalizada[1].padStart(2, "0")}:${horaNormalizada[2]}`
    : "00:00";
  const fechaLocal = new Date(`${partes.fechaToma}T${horaClinica}`);
  return Number.isNaN(fechaLocal.getTime()) ? new Date().toISOString() : fechaLocal.toISOString();
}

export function extraerSignosVitalesEstructuradosDeNota(nota = {}) {
  const observacion = nota.observacionFray || {};
  const valores = Object.fromEntries(Object.entries(CAMPOS_SIGNOS_NOTA)
    .map(([campo, clave]) => [campo, valorEstructurado(observacion[clave] ?? nota[clave])])
    .filter(([, valor]) => valor));
  return valores;
}

function fechaRegistroComoNumero(registro = {}) {
  const valor = registro.fecha || registro.fechaToma || registro.takenAt || registro.creadoEn || "";
  const timestamp = new Date(valor).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function historialVitalObservationCount(historial = {}) {
  return Math.max(
    0,
    ...[...CAMPOS_VITALES_EXPEDIENTE].map((clave) => (
      Array.isArray(historial?.[clave]) ? historial[clave].length : 0
    ))
  );
}

function fechaActualVital(paciente = {}, clave = "") {
  const fechaMeta = paciente.signosVitalesMeta?.[clave]?.fecha;
  if (fechaMeta && fechaRegistroComoNumero({ fecha: fechaMeta })) return { fecha: fechaMeta };
  const registros = Array.isArray(paciente.historialSignosVitales?.[clave])
    ? paciente.historialSignosVitales[clave]
    : [];
  return registros.reduce((ultima, registro) => (
    fechaRegistroComoNumero(registro) > fechaRegistroComoNumero(ultima) ? registro : ultima
  ), null);
}

export function construirActualizacionSignosVitalesDesdeNota({ paciente = {}, nota = {}, sourceNoteId = "", createdBy = "", audit = null } = {}) {
  const noteId = String(sourceNoteId || "").trim();
  const valores = extraerSignosVitalesEstructuradosDeNota(nota);
  if (!noteId || !Object.keys(valores).length) return null;
  const takenAt = resolverFechaClinicaNota(nota);
  const historial = Object.fromEntries(Object.entries(paciente.historialSignosVitales || {}).map(([clave, registros]) => [clave, Array.isArray(registros) ? [...registros] : []]));
  const auditState = {
    historyBefore: historialVitalObservationCount(historial),
    inserted: false,
    becameCurrent: false,
    historyAfter: 0
  };
  const registroBase = {
    sourceType: "clinical_note",
    sourceNoteId: noteId,
    takenAt,
    fecha: takenAt,
    fechaToma: takenAt,
    createdAt: new Date().toISOString(),
    createdBy: String(createdBy || ""),
    uidRegistro: String(createdBy || ""),
    values: valores,
    esPrevio: false
  };
  for (const [clave, valor] of Object.entries(valores)) {
    const registros = historial[clave] || [];
    const indice = registros.findIndex((registro) => String(registro?.sourceNoteId || "") === noteId);
    const previo = indice >= 0 ? registros[indice] : null;
    const registro = { ...registroBase, createdAt: previo?.createdAt || registroBase.createdAt, updatedAt: new Date().toISOString(), valor, nota: previo?.nota || "" };
    if (indice >= 0) registros[indice] = { ...previo, ...registro };
    else {
      registros.push(registro);
      auditState.inserted = true;
    }
    historial[clave] = registros;
  }
  const actualizacion = { historialSignosVitales: historial };
  const signosVitales = { ...(paciente.signosVitales || {}) };
  const signosVitalesMeta = { ...(paciente.signosVitalesMeta || {}) };
  const somatometria = { ...(paciente.somatometria || {}) };
  const datosInstitucionales = { ...(paciente.datosInstitucionales || {}) };
  for (const [clave, valor] of Object.entries(valores)) {
    const esVital = CAMPOS_VITALES_EXPEDIENTE.has(clave);
    const registroActual = fechaActualVital(paciente, clave);
    const fechaActualNumero = fechaRegistroComoNumero(registroActual || {});
    const fechaImportadaNumero = fechaRegistroComoNumero({ fecha: takenAt });
    const debeSerActual = !esVital || !fechaActualNumero || fechaImportadaNumero >= fechaActualNumero;
    if (debeSerActual) {
      signosVitales[clave] = valor;
      datosInstitucionales[clave] = valor;
      actualizacion[clave] = valor;
    } else if (esVital) {
      const valorActual = paciente[clave] ?? paciente.signosVitales?.[clave] ?? paciente.datosInstitucionales?.[clave];
      if (valorActual !== undefined && valorActual !== null && valorActual !== "") actualizacion[clave] = valorActual;
    }
    if (esVital && debeSerActual) {
      auditState.becameCurrent = true;
      signosVitalesMeta[clave] = {
        ...(signosVitalesMeta[clave] || {}),
        fecha: takenAt,
        hora: partesFechaLocal(takenAt).horaToma,
        uidRegistro: String(createdBy || "")
      };
    }
    if (["peso", "talla", "imc"].includes(clave)) somatometria[clave] = valor;
  }
  actualizacion.signosVitales = signosVitales;
  actualizacion.signosVitalesMeta = signosVitalesMeta;
  actualizacion.somatometria = somatometria;
  actualizacion.datosInstitucionales = datosInstitucionales;
  auditState.historyAfter = historialVitalObservationCount(historial);
  if (audit && typeof audit === "object") Object.assign(audit, auditState);
  return actualizacion;
}
