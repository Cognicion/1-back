import { obtenerUsuario } from "../../services/usuarios.js";
import { obtenerHistorialNotas } from "../../services/notas.js";
import { obtenerHistoriaClinica } from "../../services/historias.js";
import { listarTratamientos } from "../../services/tratamientos.js";
import { fechaAISO, hashTextoSHA256, normalizarFechaDocumento, textoVisible } from "./eventosDetectadosUtils.js";

const CAMPOS_TEXTO_PACIENTE = [
  "motivoConsulta", "padecimientoActual", "diagnostico", "observaciones", "antecedentes",
  "antecedentesHeredofamiliares", "antecedentesPersonalesPatologicos", "antecedentesPersonalesNoPatologicos"
];

const CAMPOS_TEXTO_NOTA = [
  "titulo", "tipoNota", "tipoNotaNombre", "contenido", "texto", "nota", "evolucion", "subjetivo",
  "padecimientoActual", "examenMental", "analisis", "plan", "notaClinica"
];

function fechaDocumento(datos = {}) {
  const candidatos = [
    datos.fechaNota,
    datos.fecha,
    datos.fechaNotaDefinitiva,
    datos.fechaCierre,
    datos.fechaCreacion,
    datos.createdAt,
    datos.creadoEn,
    datos.fechaActualizacion,
    datos.fechaInicio
  ];
  for (const candidato of candidatos) {
    const fecha = normalizarFechaDocumento(candidato);
    if (fecha) return fecha;
  }
  return new Date();
}

function unirCampos(datos = {}, campos = []) {
  return campos
    .map((campo) => {
      const valor = datos?.[campo];
      if (!valor) return "";
      if (typeof valor === "string") return valor;
      if (Array.isArray(valor)) return valor.map((item) => typeof item === "string" ? item : Object.values(item || {}).join(" ")).join(". ");
      if (typeof valor === "object") return Object.values(valor).filter((item) => typeof item === "string" || typeof item === "number").join(". ");
      return "";
    })
    .filter(Boolean)
    .join(". ");
}

function fragmentarTexto(texto = "", max = 1200) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  const frases = limpio.split(/(?<=[.!?])\s+/);
  const fragmentos = [];
  let actual = "";
  for (const frase of frases) {
    if ((actual + " " + frase).trim().length > max && actual) {
      fragmentos.push(actual.trim());
      actual = frase;
    } else {
      actual = `${actual} ${frase}`.trim();
    }
  }
  if (actual) fragmentos.push(actual.trim());
  return fragmentos;
}

async function construirFragmentos({ origenTipo, origenSubtipo, origenId, fecha, texto, seccion = "" }) {
  const fechaDocumentoISO = fechaAISO(fecha);
  const hashFuente = await hashTextoSHA256(`${origenTipo}|${origenSubtipo}|${origenId}|${fechaDocumentoISO}|${texto}`);
  const partes = fragmentarTexto(texto);
  const salida = [];
  for (let index = 0; index < partes.length; index += 1) {
    salida.push({
      origenTipo,
      origenSubtipo,
      origenId,
      fechaDocumento: fecha,
      fechaDocumentoISO,
      origenFechaReferencia: fechaDocumentoISO ? "fecha_documento" : "fecha_actual_incierta",
      texto: partes[index],
      seccion,
      indiceFragmento: index,
      hashFuente,
      hashFragmento: await hashTextoSHA256(`${hashFuente}|${index}|${partes[index]}`)
    });
  }
  return salida;
}

export async function obtenerFuentesEventosClinicos({ pacienteId }) {
  const fuentes = [];
  const errores = [];
  let paciente = null;

  try {
    paciente = await obtenerUsuario(pacienteId);
    const texto = unirCampos(paciente, CAMPOS_TEXTO_PACIENTE);
    if (texto) {
      fuentes.push(...await construirFragmentos({
        origenTipo: "paciente",
        origenSubtipo: "datos_clinicos",
        origenId: pacienteId,
        fecha: fechaDocumento(paciente),
        texto,
        seccion: "Resumen clinico del paciente"
      }));
    }
  } catch (error) {
    errores.push({ fuente: "paciente", codigo: error?.code || error?.message || "error" });
  }

  try {
    const historia = await obtenerHistoriaClinica(pacienteId);
    if (historia.exists()) {
      const datos = historia.data();
      const texto = unirCampos(datos, Object.keys(datos || {}));
      if (texto) {
        fuentes.push(...await construirFragmentos({
          origenTipo: "historia_clinica",
          origenSubtipo: "historia_inicial",
          origenId: historia.id,
          fecha: fechaDocumento(datos),
          texto,
          seccion: "Historia clinica"
        }));
      }
    }
  } catch (error) {
    errores.push({ fuente: "historia_clinica", codigo: error?.code || error?.message || "error" });
  }

  try {
    const notas = await obtenerHistorialNotas(pacienteId);
    const promesas = [];
    notas.forEach((docNota) => {
      const datos = docNota.data();
      const vigente = datos.notaEditada && typeof datos.notaEditada === "object" ? datos.notaEditada : datos;
      const texto = unirCampos(vigente, CAMPOS_TEXTO_NOTA);
      if (!texto) return;
      promesas.push(construirFragmentos({
        origenTipo: "nota",
        origenSubtipo: vigente.tipoNotaClave || vigente.tipoNota || vigente.tipo || "nota_clinica",
        origenId: docNota.id,
        fecha: fechaDocumento(vigente),
        texto,
        seccion: vigente.tipoNota || vigente.tipoNotaNombre || "Nota clinica"
      }));
    });
    fuentes.push(...(await Promise.all(promesas)).flat());
  } catch (error) {
    errores.push({ fuente: "notas", codigo: error?.code || error?.message || "error" });
  }

  try {
    const tratamientos = await listarTratamientos(pacienteId);
    for (const tratamiento of tratamientos) {
      const texto = [
        tratamiento.medicamento,
        tratamiento.presentacion,
        tratamiento.dosis,
        tratamiento.frecuencia,
        tratamiento.via,
        tratamiento.indicaciones,
        tratamiento.observaciones,
        tratamiento.motivoSuspension
      ].filter(Boolean).join(". ");
      if (!texto) continue;
      fuentes.push(...await construirFragmentos({
        origenTipo: "tratamiento",
        origenSubtipo: tratamiento.estado === "suspendido" ? "tratamiento_suspendido" : "tratamiento",
        origenId: tratamiento.id,
        fecha: fechaDocumento(tratamiento),
        texto: textoVisible(texto, 900),
        seccion: "Tratamiento e indicaciones"
      }));
    }
  } catch (error) {
    errores.push({ fuente: "tratamientos", codigo: error?.code || error?.message || "error" });
  }

  return {
    paciente: paciente || {},
    fragmentos: fuentes,
    errores
  };
}
