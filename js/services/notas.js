import { db } from "../firebase.js";

import {
  collection,
  addDoc,
  doc,
  getDocs,
  query,
  orderBy,
  where,
  updateDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
