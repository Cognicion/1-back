import { db } from "../../firebase.js";
import { obtenerStorage } from "../../services/firebaseAppService.js";
import { crearPacienteProvisional } from "../../services/usuarios.js?v=20260729-imc-payload-fix";
import { guardarBorradorNotaClinica } from "../../services/notas.js?v=20260716-2";
import { registrarEventoAuditoria, resumenError } from "../../services/auditoria.js";
import { DOCX_IMPORT_CONFIG } from "./docxImportConfig.js";
import {
  addDoc,
  collection,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

function nombreSeguro(nombre = "documento.docx") {
  return String(nombre).replace(/[^\w.\-]+/g, "_").slice(0, 140) || "documento.docx";
}

async function generarExpedienteCognicion() {
  const anio = String(new Date().getFullYear()).slice(-2);
  const semilla = Date.now().toString().slice(-6);
  return `C${semilla}-${anio}`;
}

function payloadPacienteDesdeCampos(campos = {}, usuarioUid = "") {
  const nombre = campos.nombre || "Paciente importado sin nombre";
  const expedienteCognicion = campos.expedienteCognicion || "";
  return {
    nombre,
    nombreCompleto: nombre,
    expedienteCognicion,
    edadManual: campos.edad || "",
    sexo: campos.sexo || "",
    fechaNacimiento: campos.fechaNacimiento || "",
    curp: campos.curp || "",
    tipoPaciente: campos.institucion ? "institucion" : "privada",
    institucionPaciente: campos.institucion || "",
    institucion: campos.institucion || "",
    servicioInstitucional: campos.servicio || "",
    servicio: campos.servicio || "",
    expediente: campos.expediente || "",
    numeroExpediente: campos.expediente || "",
    medicoTratante: campos.medicoTratante || "",
    medicoAdscritoEncargado: campos.medicoAdscrito || "",
    datosInstitucionales: {
      nombrePaciente: nombre,
      nombreCompleto: nombre,
      expedienteCognicion,
      edadManual: campos.edad || "",
      sexo: campos.sexo || "",
      fechaNacimiento: campos.fechaNacimiento || "",
      curp: campos.curp || "",
      institucionPaciente: campos.institucion || "",
      servicioInstitucional: campos.servicio || "",
      expediente: campos.expediente || ""
    },
    origenImportacionDocx: true,
    creadoPor: usuarioUid,
    ownerUid: usuarioUid,
    createdByUid: usuarioUid,
    medicoUid: usuarioUid,
    medicoTratanteUid: usuarioUid,
    medicosAutorizados: [usuarioUid].filter(Boolean)
  };
}

function construirNotaImportada({ campos, secciones, tipoNota, textoPlano, estructura, importacionId, archivo }) {
  return {
    tipoNota: tipoNota?.label || "Nota clinica importada",
    tipoNotaClave: `importacion_docx:${tipoNota?.key || "nota_clinica"}`,
    formato: "importacion_docx",
    estadoNota: "borrador",
    esBorrador: true,
    origen: "importacion_docx",
    notaRapida: textoPlano,
    subjetivo: secciones.padecimientoActual || secciones.motivoConsulta || "",
    objetivo: [secciones.objetivo, secciones.examenMental].filter(Boolean).join("\n\n"),
    analisis: [secciones.analisis, secciones.diagnosticos].filter(Boolean).join("\n\n"),
    plan: [secciones.plan, secciones.tratamiento].filter(Boolean).join("\n\n"),
    tratamiento: secciones.tratamiento || secciones.plan || "",
    fechaNotaInput: campos.fecha || "",
    horaNotaInput: campos.hora || "",
    observacionFray: {
      tipoNota: tipoNota?.key || "nota_clinica",
      fechaNota: campos.fecha || "",
      horaNota: campos.hora || "",
      servicio: campos.servicio || "",
      expediente: campos.expediente || "",
      motivoAtencion: secciones.motivoConsulta || secciones.padecimientoActual || "",
      examenMental: secciones.examenMental || secciones.objetivo || "",
      comentarioAnalisis: secciones.analisis || secciones.diagnosticos || "",
      planTerapeutico: secciones.plan || secciones.tratamiento || ""
    },
    importacionDocx: {
      importacionId,
      archivoNombre: archivo.nombre,
      hash: archivo.hash,
      textoExtraido: textoPlano,
      estructura
    }
  };
}

async function subirDocumentoOriginal({ file, hash, usuarioUid }) {
  const storage = await obtenerStorage();
  const ruta = `${DOCX_IMPORT_CONFIG.storageRoot}/${usuarioUid}/${hash}/${nombreSeguro(file.name)}`;
  const referencia = ref(storage, ruta);
  await uploadBytes(referencia, file, {
    contentType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    customMetadata: { hash, origen: "importacion_docx" }
  });
  return { ruta, url: await getDownloadURL(referencia) };
}

export async function guardarImportacionDocx({ file, hash, usuario, campos, secciones, tipoNota, textoPlano, estructura, modo, pacienteIdSeleccionado }) {
  let pacienteId = pacienteIdSeleccionado || "";
  let pacienteCreado = false;
  let notaId = "";
  let importacionId = "";

  try {
    const expedienteCognicion = modo === "nuevo" ? await generarExpedienteCognicion() : "";
    const camposFinales = { ...campos, expedienteCognicion };
    if (modo === "nuevo") {
      const refPaciente = await crearPacienteProvisional(payloadPacienteDesdeCampos(camposFinales, usuario.uid));
      pacienteId = refPaciente.id;
      pacienteCreado = true;
    }
    if (!pacienteId) throw new Error("Selecciona un paciente o crea uno nuevo.");

    const archivoOriginal = await subirDocumentoOriginal({ file, hash, usuarioUid: usuario.uid });
    const refImportacion = doc(db, "usuarios", usuario.uid, DOCX_IMPORT_CONFIG.duplicateUserSubcollection, hash);
    await setDoc(refImportacion, {
      ownerUid: usuario.uid,
      usuarioUid: usuario.uid,
      pacienteId,
      sourceFileHash: hash,
      hash,
      archivoNombre: file.name,
      archivoTamano: file.size,
      archivoTipo: file.type || "",
      archivoStoragePath: archivoOriginal.ruta,
      archivoUrl: archivoOriginal.url,
      textoExtraido: textoPlano,
      estructura,
      campos,
      secciones,
      tipoNotaSugerido: tipoNota,
      pacienteCreado,
      creadoEn: serverTimestamp(),
      fechaISO: new Date().toISOString()
    }, { merge: true });
    importacionId = refImportacion.id;

    await addDoc(collection(db, "usuarios", pacienteId, "documentosImportados"), {
      importacionId,
      hash,
      archivoNombre: file.name,
      archivoStoragePath: archivoOriginal.ruta,
      archivoUrl: archivoOriginal.url,
      textoExtraido: textoPlano,
      estructura,
      campos,
      secciones,
      tipoNotaSugerido: tipoNota,
      creadoPor: usuario.uid,
      creadoEn: serverTimestamp(),
      fechaISO: new Date().toISOString()
    });

    const nota = construirNotaImportada({
      campos,
      secciones,
      tipoNota,
      textoPlano,
      estructura,
      importacionId,
      archivo: { nombre: file.name, hash }
    });
    const refNota = doc(collection(db, "usuarios", pacienteId, "notasMedicas"));
    const guardada = await guardarBorradorNotaClinica(pacienteId, refNota.id, nota);
    notaId = guardada.notaId || guardada.id || refNota.id;

    await registrarEventoAuditoria({
      accion: "importar_docx_clinico",
      modulo: "Importacion DOCX",
      descripcion: "El usuario importo un documento DOCX clinico sin IA.",
      usuarioUid: usuario.uid,
      usuarioNombre: usuario.nombre || usuario.email || "",
      usuarioRol: usuario.rol || "",
      pacienteUid: pacienteId,
      pacienteNombre: campos.nombre || "",
      exito: true,
      detalles: { hash, archivo: file.name, importacionId, notaId, pacienteCreado }
    });

    return { pacienteId, pacienteCreado, notaId, importacionId };
  } catch (error) {
    await registrarEventoAuditoria({
      accion: "importar_docx_clinico",
      modulo: "Importacion DOCX",
      descripcion: "Fallo la importacion de un documento DOCX clinico.",
      usuarioUid: usuario.uid,
      usuarioNombre: usuario.nombre || usuario.email || "",
      usuarioRol: usuario.rol || "",
      pacienteUid: pacienteId,
      pacienteNombre: campos?.nombre || "",
      exito: false,
      detalles: { hash, archivo: file?.name || "", error: resumenError(error), importacionId, notaId }
    }).catch(() => {});
    throw error;
  }
}
