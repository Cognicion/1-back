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
  updateDoc,
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
    if (datosActuales?.estadoNota === "definitiva" || datosActuales?.bloqueada === true) {
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
    if (datosActuales?.estadoNota === "definitiva" || datosActuales?.bloqueada === true) {
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
      const estado = nota.estadoNota || (nota.esBorrador ? "borrador" : "definitiva");
      return estado === "borrador"
        && (!contexto.atencionId || nota.atencionId === contexto.atencionId)
        && (!contexto.tipoNotaClave || nota.tipoNotaClave === contexto.tipoNotaClave)
        && (!contexto.tipoNota || nota.tipoNota === contexto.tipoNota)
        && (!contexto.usuarioId || nota.usuarioId === contexto.usuarioId);
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

function fechaNotaEnMs(datos = {}) {
  const valor = datos.fecha || datos.fechaNotaDefinitiva || datos.fechaGuardadoBorrador || datos.fechaCreacion || datos.createdAt || datos.fechaRegistro;
  if (!valor) return 0;
  if (typeof valor.toDate === "function") return valor.toDate().getTime();
  if (typeof valor.seconds === "number") return valor.seconds * 1000;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 0 : fecha.getTime();
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

export async function actualizarNota(uidPaciente, notaId, datosEdicion) {
  const { raiz, coleccion: nombreColeccion, idOriginal } = descomponerIdNota(notaId);
  const referencia = raiz === "root"
    ? doc(db, nombreColeccion, idOriginal)
    : doc(db, raiz, uidPaciente, nombreColeccion, idOriginal);

  await updateDoc(
    referencia,
    {
      notaEditada: datosEdicion,
      ediciones: arrayUnion(datosEdicion),
      fechaUltimaEdicion: new Date().toISOString()
    }
  );
}
