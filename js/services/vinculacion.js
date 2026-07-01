import { db } from "../firebase.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const SUBCOLECCIONES_USUARIO = [
  "notas",
  "tratamientos",
  "estudios",
  "notasRapidas",
  "resultadosEscalas",
  "metasTerapeuticas",
  "permisosMedicos",
  "historiaClinica",
  "escalasAsignadas",
  "tareasMiSalud",
  "diarioPersonal",
  "apuntesMedico",
  "borradoresMedico"
];

const SUBCOLECCIONES_LEGACY_PACIENTE = [
  "registrosDiarios"
];

const DOCUMENTOS_LEGACY_PACIENTE = [
  ["miSalud", "metas"],
  ["miSalud", "agenda"]
];

function generarCodigo() {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "COG-";

  for (let i = 0; i < 8; i += 1) {
    codigo += caracteres[Math.floor(Math.random() * caracteres.length)];
    if (i === 3) codigo += "-";
  }

  return codigo;
}

function fechaExpiracion(dias = 14) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString();
}

function codigoNormalizado(codigo) {
  return String(codigo || "").trim().toUpperCase();
}

function expirado(datosCodigo = {}) {
  return datosCodigo.expiraEn && new Date(datosCodigo.expiraEn).getTime() < Date.now();
}

async function crearDocumentoCodigo(datos) {
  let codigo = generarCodigo();
  let ref = doc(db, "codigosVinculacion", codigo);
  let snap = await getDoc(ref);

  while (snap.exists()) {
    codigo = generarCodigo();
    ref = doc(db, "codigosVinculacion", codigo);
    snap = await getDoc(ref);
  }

  await setDoc(ref, {
    codigo,
    usado: false,
    fechaCreacion: new Date().toISOString(),
    expiraEn: fechaExpiracion(),
    ...datos
  });

  return codigo;
}

export async function crearCodigoExpedienteParaPaciente(pacienteId, medicoUid) {
  const pacienteSnap = await getDoc(doc(db, "usuarios", pacienteId));
  if (!pacienteSnap.exists()) throw new Error("No se encontro el expediente del paciente.");

  const paciente = pacienteSnap.data();
  const codigo = await crearDocumentoCodigo({
    tipo: "medico_a_paciente",
    pacienteProvisionalId: pacienteId,
    pacienteNombre: paciente.nombre || "",
    medicoUid
  });

  await updateDoc(doc(db, "usuarios", pacienteId), {
    codigoVinculacionActivo: codigo,
    fechaCodigoVinculacion: new Date().toISOString()
  });

  return codigo;
}

export async function crearCodigoPacienteParaMedico(pacienteUid) {
  const pacienteSnap = await getDoc(doc(db, "usuarios", pacienteUid));
  if (!pacienteSnap.exists()) throw new Error("No se encontro la cuenta del paciente.");

  const paciente = pacienteSnap.data();
  return await crearDocumentoCodigo({
    tipo: "paciente_a_medico",
    pacienteCuentaUid: pacienteUid,
    pacienteNombre: paciente.nombre || paciente.email || ""
  });
}

async function copiarSubcoleccion(baseOrigen, baseDestino, nombreSubcoleccion) {
  const snap = await getDocs(collection(baseOrigen, nombreSubcoleccion));

  for (const docOrigen of snap.docs) {
    await setDoc(
      doc(baseDestino, nombreSubcoleccion, docOrigen.id),
      docOrigen.data(),
      { merge: true }
    );
  }
}

async function copiarDatosLegacy(origenUid, destinoUid) {
  for (const nombreSubcoleccion of SUBCOLECCIONES_LEGACY_PACIENTE) {
    const origenBase = doc(db, "pacientes", origenUid);
    const destinoBase = doc(db, "pacientes", destinoUid);
    await copiarSubcoleccion(origenBase, destinoBase, nombreSubcoleccion);
  }

  for (const [coleccion, documento] of DOCUMENTOS_LEGACY_PACIENTE) {
    const origenRef = doc(db, "pacientes", origenUid, coleccion, documento);
    const origenSnap = await getDoc(origenRef);
    if (!origenSnap.exists()) continue;

    await setDoc(
      doc(db, "pacientes", destinoUid, coleccion, documento),
      origenSnap.data(),
      { merge: true }
    );
  }
}

async function copiarSubcoleccionesUsuario(origenUid, destinoUid) {
  const origenBase = doc(db, "usuarios", origenUid);
  const destinoBase = doc(db, "usuarios", destinoUid);

  for (const nombreSubcoleccion of SUBCOLECCIONES_USUARIO) {
    await copiarSubcoleccion(origenBase, destinoBase, nombreSubcoleccion);
  }
}

function unirListas(...listas) {
  return [...new Set(
    listas
      .flat()
      .filter(Boolean)
  )];
}

async function fusionarExpedienteConCuenta(origenUid, destinoUid, metadatos = {}) {
  if (!origenUid || !destinoUid || origenUid === destinoUid) {
    throw new Error("No se pudo identificar el expediente y la cuenta a vincular.");
  }

  const origenRef = doc(db, "usuarios", origenUid);
  const destinoRef = doc(db, "usuarios", destinoUid);
  const origenSnap = await getDoc(origenRef);
  const destinoSnap = await getDoc(destinoRef);

  if (!origenSnap.exists()) throw new Error("No se encontro el expediente previo.");
  if (!destinoSnap.exists()) throw new Error("No se encontro la cuenta del paciente.");

  const origen = origenSnap.data();
  const destino = destinoSnap.data();

  if (origen.estado === "vinculado" && origen.vinculadoA) {
    throw new Error("Este expediente ya esta vinculado a una cuenta de paciente.");
  }

  const fecha = new Date().toISOString();
  const medicosAutorizados = unirListas(
    origen.medicosAutorizados || [],
    destino.medicosAutorizados || [],
    origen.creadoPor,
    origen.medicoTratanteUid,
    destino.creadoPor,
    destino.medicoTratanteUid,
    metadatos.medicoUid
  );

  await copiarSubcoleccionesUsuario(origenUid, destinoUid);
  await copiarDatosLegacy(origenUid, destinoUid);

  await setDoc(destinoRef, {
    ...destino,
    ...origen,
    nombre: destino.nombre || origen.nombre || "",
    email: destino.email || origen.email || "",
    rol: "paciente",
    tieneCuenta: true,
    estado: "activo",
    creadoPor: origen.creadoPor || destino.creadoPor || metadatos.medicoUid || "",
    medicoTratanteUid: origen.medicoTratanteUid || destino.medicoTratanteUid || metadatos.medicoUid || "",
    medicoTratante: origen.medicoTratante || destino.medicoTratante || "",
    medicosAutorizados,
    expedienteVinculadoDesde: origenUid,
    fechaVinculacionExpediente: fecha
  }, { merge: true });

  await setDoc(origenRef, {
    ...origen,
    estado: "vinculado",
    vinculadoA: destinoUid,
    tieneCuenta: false,
    fechaVinculacionExpediente: fecha
  }, { merge: true });

  for (const medicoUid of medicosAutorizados) {
    await setDoc(doc(db, "usuarios", destinoUid, "permisosMedicos", medicoUid), {
      lectura: true,
      agregarNotas: true,
      editarPaciente: true,
      administrarPermisos: true,
      rolPermiso: "tratante",
      fechaOtorgamiento: fecha,
      otorgadoPor: metadatos.otorgadoPor || destinoUid,
      origenVinculacion: origenUid
    }, { merge: true });
  }

  return {
    pacienteUid: destinoUid,
    expedientePrevioUid: origenUid,
    pacienteNombre: destino.nombre || origen.nombre || ""
  };
}

async function obtenerCodigoValido(codigo) {
  const codigoId = codigoNormalizado(codigo);
  const codigoRef = doc(db, "codigosVinculacion", codigoId);
  const codigoSnap = await getDoc(codigoRef);

  if (!codigoSnap.exists()) throw new Error("Codigo de vinculacion no encontrado.");

  const datosCodigo = codigoSnap.data();
  if (datosCodigo.usado) throw new Error("Este codigo ya fue utilizado.");
  if (expirado(datosCodigo)) throw new Error("Este codigo ya expiro.");

  return { codigoId, codigoRef, datosCodigo };
}

export async function vincularCuentaConCodigoMedico(codigo, cuentaPacienteUid) {
  const { codigoId, codigoRef, datosCodigo } = await obtenerCodigoValido(codigo);

  if (datosCodigo.tipo !== "medico_a_paciente") {
    throw new Error("Este codigo fue generado por un paciente. Debe usarlo el medico desde el expediente previo.");
  }

  const resultado = await fusionarExpedienteConCuenta(
    datosCodigo.pacienteProvisionalId,
    cuentaPacienteUid,
    {
      medicoUid: datosCodigo.medicoUid,
      otorgadoPor: cuentaPacienteUid
    }
  );

  await updateDoc(codigoRef, {
    usado: true,
    usadoPor: cuentaPacienteUid,
    fechaUso: new Date().toISOString()
  });

  return { ...resultado, codigo: codigoId, medicoUid: datosCodigo.medicoUid || "" };
}

export async function vincularExpedienteConCodigoPaciente(codigo, expedienteProvisionalId, medicoUid) {
  const { codigoId, codigoRef, datosCodigo } = await obtenerCodigoValido(codigo);

  if (datosCodigo.tipo !== "paciente_a_medico") {
    throw new Error("Este codigo fue generado por un medico. Debe introducirlo el paciente al crear su cuenta.");
  }

  const resultado = await fusionarExpedienteConCuenta(
    expedienteProvisionalId,
    datosCodigo.pacienteCuentaUid,
    {
      medicoUid,
      otorgadoPor: datosCodigo.pacienteCuentaUid
    }
  );

  await updateDoc(codigoRef, {
    usado: true,
    usadoPor: medicoUid,
    expedienteProvisionalId,
    fechaUso: new Date().toISOString()
  });

  return { ...resultado, codigo: codigoId };
}
