import { db } from "../firebase.js";

import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  arrayUnion,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECCION_NOTAS = "notasMedicas";

function referenciaNota(uidPaciente, notaId = "") {
  if (!uidPaciente) throw new Error("No se pudo identificar al paciente.");
  if (!notaId) return doc(collection(db, "usuarios", uidPaciente, COLECCION_NOTAS));
  const { raiz, coleccion: nombreColeccion, idOriginal } = descomponerIdNota(notaId);
  if (raiz !== "usuarios" || nombreColeccion !== COLECCION_NOTAS) {
    throw new Error("La nota heredada debe copiarse a la coleccion clinica antes de editarse.");
  }
  return doc(db, "usuarios", uidPaciente, COLECCION_NOTAS, idOriginal);
}

function datosVerificacion(snapshot) {
  if (!snapshot.exists()) throw new Error("Firebase no confirmo la escritura de la nota.");
  return { id: snapshot.id, ...snapshot.data() };
}

/**
 * Crea o actualiza el mismo borrador. Una nota definitiva nunca puede volver a
 * borrador ni modificarse por esta via.
 */
export async function guardarBorradorNotaClinica(uidPaciente, notaId, payload) {
  const referencia = referenciaNota(uidPaciente, notaId);
  const ahoraIso = new Date().toISOString();

  await runTransaction(db, async (transaction) => {
    const actual = await transaction.get(referencia);
    const datosActuales = actual.exists() ? actual.data() : null;
    if (datosActuales && estadoPersistidoNota(datosActuales) === "definitiva") {
      throw new Error("La nota definitiva esta bloqueada y no puede volver a borrador.");
    }

    const version = Math.max(1, Number(datosActuales?.version || 1));
    transaction.set(referencia, {
      ...payload,
      notaId: referencia.id,
      estadoNota: "borrador",
      esBorrador: true,
      bloqueada: false,
      version,
      fecha: ahoraIso,
      fechaGuardadoBorrador: ahoraIso,
      fechaUltimaModificacion: ahoraIso,
      actualizadoEn: serverTimestamp(),
      ...(actual.exists()
        ? {}
        : {
            fechaCreacion: ahoraIso,
            creadoEn: serverTimestamp()
          })
    }, { merge: true });
  });

  const confirmado = datosVerificacion(await getDoc(referencia));
  if (confirmado.estadoNota !== "borrador") {
    throw new Error("Firebase respondio, pero no confirmo el estado borrador.");
  }
  return confirmado;
}

/** Convierte atomicamente el mismo documento de borrador a definitivo. */
export async function finalizarNotaClinica(uidPaciente, notaId, payload, cierre) {
  const referencia = referenciaNota(uidPaciente, notaId);
  const ahoraIso = new Date().toISOString();

  await runTransaction(db, async (transaction) => {
    const actual = await transaction.get(referencia);
    const datosActuales = actual.exists() ? actual.data() : null;
    if (datosActuales && estadoPersistidoNota(datosActuales) === "definitiva") {
      throw new Error("Esta nota ya fue cerrada como definitiva.");
    }

    const versionAnterior = Number(datosActuales?.version || 0);
    const version = Math.max(1, versionAnterior + (actual.exists() ? 1 : 0));
    const eventoCierre = {
      tipo: "cierre_definitivo",
      fecha: ahoraIso,
      usuarioId: cierre.usuarioId || "",
      usuarioNombre: cierre.usuarioNombre || "",
      version
    };

    transaction.set(referencia, {
      ...payload,
      notaId: referencia.id,
      estadoNota: "definitiva",
      esBorrador: false,
      bloqueada: true,
      version,
      fecha: ahoraIso,
      fechaNotaDefinitiva: ahoraIso,
      fechaCierre: ahoraIso,
      fechaUltimaModificacion: ahoraIso,
      cerradoPorId: cierre.usuarioId || "",
      cerradoPorNombre: cierre.usuarioNombre || "",
      actualizadoEn: serverTimestamp(),
      historialEstados: arrayUnion(eventoCierre),
      ...(actual.exists()
        ? {}
        : {
            fechaCreacion: ahoraIso,
            creadoEn: serverTimestamp()
          })
    }, { merge: true });
  });

  const confirmado = datosVerificacion(await getDoc(referencia));
  if (confirmado.estadoNota !== "definitiva" || confirmado.bloqueada !== true) {
    throw new Error("Firebase respondio, pero no confirmo el cierre definitivo.");
  }
  return confirmado;
}

export async function buscarBorradorNotaClinica(uidPaciente, contexto = {}) {
  const snap = await getDocs(collection(db, "usuarios", uidPaciente, COLECCION_NOTAS));
  const candidatos = snap.docs
    .map((documento) => ({ id: documento.id, ...documento.data() }))
    .filter((nota) => {
      const vigente = datosVigentesNota(nota);
      return estadoPersistidoNota(nota) === "borrador"
        && (!contexto.atencionId || (vigente.atencionId || nota.atencionId) === contexto.atencionId)
        && (!contexto.tipoNotaClave || (vigente.tipoNotaClave || nota.tipoNotaClave) === contexto.tipoNotaClave)
        && (!contexto.tipoNota || (vigente.tipoNota || nota.tipoNota) === contexto.tipoNota)
        && (!contexto.usuarioId || (vigente.usuarioId || nota.usuarioId) === contexto.usuarioId);
    })
    .sort((a, b) => fechaNotaEnMs(b) - fechaNotaEnMs(a));
  return candidatos[0] || null;
}

export async function guardarNota(uidPaciente, datosNota) {
  const referencia = await addDoc(
    collection(db, "usuarios", uidPaciente, "notasMedicas"),
    {
      ...datosNota,
      fecha: new Date().toISOString()
    }
  );
  return referencia.id;
}

const ESTADOS_BORRADOR = new Set(["borrador", "draft"]);
const ESTADOS_DEFINITIVOS = new Set([
  "definitiva", "definitivo", "firmada", "firmado", "cerrada", "cerrado", "final"
]);

function valorEstadoPersistido(datos = {}) {
  return String(datos.estadoNota || datos.estado || "").trim().toLowerCase();
}

function estadoPersistidoNota(datos = {}) {
  const estadoRaiz = valorEstadoPersistido(datos);
  if (datos.bloqueada === true || ESTADOS_DEFINITIVOS.has(estadoRaiz)) return "definitiva";
  if (ESTADOS_BORRADOR.has(estadoRaiz) || datos.esBorrador === true) return "borrador";
  if (datos.esBorrador === false || (datos.notaEditada && Array.isArray(datos.ediciones))) return "definitiva";
  return ESTADOS_BORRADOR.has(valorEstadoPersistido(datos.notaEditada || {})) ? "borrador" : "definitiva";
}

function fechaPropiaNotaEnMs(datos = {}) {
  const valor = datos.fechaUltimaModificacion || datos.fechaEdicion || datos.fechaGuardadoBorrador
    || datos.fechaNotaDefinitiva || datos.fecha || datos.fechaCreacion || datos.createdAt || datos.fechaRegistro;
  if (!valor) return 0;
  if (typeof valor.toDate === "function") return valor.toDate().getTime();
  if (typeof valor.seconds === "number") return valor.seconds * 1000;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 0 : fecha.getTime();
}

function datosVigentesNota(datos = {}) {
  if (!datos.notaEditada || typeof datos.notaEditada !== "object") return datos;
  if (estadoPersistidoNota(datos) !== "borrador") return datos.notaEditada;
  return fechaPropiaNotaEnMs(datos.notaEditada) > fechaPropiaNotaEnMs(datos)
    ? datos.notaEditada
    : datos;
}

function fechaNotaEnMs(datos = {}) {
  return fechaPropiaNotaEnMs(datosVigentesNota(datos));
}

function crearSnapshotNotaCompatible(nota, raiz, nombreColeccion) {
  const idOriginal = nota.id;
  const id = `${raiz}::${nombreColeccion}::${idOriginal}`;
  return {
    id,
    ref: nota.ref,
    data() {
      return {
        ...nota.data(),
        __notaRaiz: raiz,
        __notaColeccion: nombreColeccion,
        __notaIdOriginal: idOriginal,
        __notaFirestorePath: nota.ref?.path || ""
      };
    }
  };
}

function descomponerIdNota(notaId) {
  const partes = String(notaId || "").split("::");
  if (partes.length === 3) {
    return {
      raiz: partes[0],
      coleccion: partes[1],
      idOriginal: partes[2]
    };
  }
  return {
    raiz: "usuarios",
    coleccion: "notasMedicas",
    idOriginal: notaId
  };
}

export async function obtenerHistorialNotas(uidPaciente) {
  const coleccionesCompatibles = [
    "notasMedicas",
    "notas",
    "notasClinicas"
  ];
  const raicesCompatibles = ["usuarios", "pacientes"];
  const camposPacienteCompatibles = ["uidPaciente", "idPaciente", "pacienteId", "pacienteUid"];
  const notasPorClave = new Map();

  function agregarDocs(snap, raiz, nombreColeccion) {
    snap.docs.forEach((nota) => {
      notasPorClave.set(
        `${raiz}:${nombreColeccion}:${nota.id}`,
        crearSnapshotNotaCompatible(nota, raiz, nombreColeccion)
      );
    });
  }

  for (const raiz of raicesCompatibles) {
    for (const nombreColeccion of coleccionesCompatibles) {
      try {
        const q = query(
          collection(db, raiz, uidPaciente, nombreColeccion),
          orderBy("fecha", "desc")
        );
        const snap = await getDocs(q);
        agregarDocs(snap, raiz, nombreColeccion);
      } catch (errorOrdenado) {
        if (raiz === "usuarios" && nombreColeccion === "notasMedicas") {
          console.warn("No se pudo cargar el historial ordenado de notas:", errorOrdenado);
        }
      }

      try {
        const snap = await getDocs(collection(db, raiz, uidPaciente, nombreColeccion));
        agregarDocs(snap, raiz, nombreColeccion);
      } catch (errorSimple) {
        if (raiz === "usuarios" && nombreColeccion === "notasMedicas") {
          console.warn("No se pudo cargar el historial principal de notas:", errorSimple);
        }
      }
    }
  }

  for (const nombreColeccion of coleccionesCompatibles) {
    for (const campoPaciente of camposPacienteCompatibles) {
      try {
        const snap = await getDocs(
          query(collection(db, nombreColeccion), where(campoPaciente, "==", uidPaciente))
        );
        agregarDocs(snap, "root", nombreColeccion);
      } catch (errorRaiz) {
        // Algunas instalaciones no tienen colecciones raíz o las reglas no permiten consultarlas.
      }
    }
  }

  const docs = [...notasPorClave.values()].sort((a, b) => {
    const datosA = a.data?.() || {};
    const datosB = b.data?.() || {};
    return fechaNotaEnMs(datosB) - fechaNotaEnMs(datosA);
  });

  return {
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach(callback) {
      docs.forEach(callback);
    }
  };
}

export async function actualizarNota(uidPaciente, notaId, datosEdicion, editor = {}) {
  const { raiz, coleccion: nombreColeccion, idOriginal } = descomponerIdNota(notaId);
  const referencia = raiz === "root"
    ? doc(db, nombreColeccion, idOriginal)
    : doc(db, raiz, uidPaciente, nombreColeccion, idOriginal);

  const ahoraIso = new Date().toISOString();
  let versionGuardada = 0;

  await runTransaction(db, async (transaction) => {
    const actual = await transaction.get(referencia);
    if (!actual.exists()) throw new Error("No se encontro la nota que se desea editar.");

    const datosActuales = actual.data() || {};
    if (estadoPersistidoNota(datosActuales) !== "definitiva") {
      throw new Error("Los borradores deben actualizarse sobre el mismo documento sin crear historial.");
    }
    const versionesPrevias = Array.isArray(datosActuales.ediciones) ? datosActuales.ediciones : [];
    const versionMayorEnHistorial = versionesPrevias.reduce(
      (mayor, version) => Math.max(mayor, Number(version?.version || 0)),
      0
    );
    const versionActual = Math.max(
      1,
      Number(datosActuales.notaEditada?.version || 0),
      Number(datosActuales.version || 0),
      versionMayorEnHistorial
    );
    versionGuardada = versionActual + 1;

    const nuevaVersion = {
      ...datosEdicion,
      version: versionGuardada,
      versionAnterior: versionActual,
      fechaEdicion: ahoraIso,
      editadoPorId: editor.usuarioId || "",
      editadoPorNombre: editor.usuarioNombre || ""
    };
    const eventoEdicion = {
      tipo: datosEdicion.estadoNota === "definitiva" ? "edicion_definitiva" : "edicion_borrador",
      fecha: ahoraIso,
      usuarioId: editor.usuarioId || "",
      usuarioNombre: editor.usuarioNombre || "",
      version: versionGuardada,
      versionAnterior: versionActual
    };

    transaction.update(referencia, {
      notaEditada: nuevaVersion,
      ediciones: arrayUnion(nuevaVersion),
      version: versionGuardada,
      fechaUltimaEdicion: ahoraIso,
      fechaUltimaModificacion: ahoraIso,
      actualizadoEn: serverTimestamp(),
      historialEstados: arrayUnion(eventoEdicion)
    });
  });

  const confirmado = datosVerificacion(await getDoc(referencia));
  if (Number(confirmado.notaEditada?.version || 0) !== versionGuardada) {
    throw new Error("Firebase respondio, pero no confirmo la nueva version de la nota.");
  }
  return { ...confirmado, id: notaId };
}
