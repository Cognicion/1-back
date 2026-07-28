import { db } from "../firebase.js";

import {
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const OMITIR = Symbol("omitir");

function esTipoFirebaseCompatible(valor) {
  return Boolean(valor && typeof valor === "object" && typeof valor.toDate === "function" && typeof valor.seconds === "number");
}

function sanitizarValor(valor) {
  if (valor === undefined || typeof valor === "function") return OMITIR;
  if (typeof Node !== "undefined" && valor instanceof Node) return OMITIR;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : new Date(valor.getTime());
  if (valor === null || typeof valor !== "object" || esTipoFirebaseCompatible(valor)) return valor;
  if (Array.isArray(valor)) return valor.map(sanitizarValor).filter((item) => item !== OMITIR);
  const salida = {};
  Object.entries(valor).forEach(([clave, item]) => {
    const seguro = sanitizarValor(item);
    if (seguro !== OMITIR) salida[clave] = seguro;
  });
  return salida;
}

export function sanitizarDatosHistoriaClinica(datos = {}) {
  const seguro = sanitizarValor(datos);
  return seguro && typeof seguro === "object" && !Array.isArray(seguro) ? seguro : {};
}

export async function guardarHistoriaClinica(uidPaciente, datosHistoria) {
  if (!uidPaciente) throw Object.assign(new Error("PACIENTE_ID_REQUERIDO"), { code: "patient-id-missing" });
  await setDoc(
    doc(db, "usuarios", uidPaciente, "historiaClinica", "historiaInicial"),
    {
      ...sanitizarDatosHistoriaClinica(datosHistoria),
      fechaActualizacion: new Date().toISOString()
    },
    { merge: true }
  );
}

export async function obtenerHistoriaClinica(uidPaciente) {
  return await getDoc(
    doc(db, "usuarios", uidPaciente, "historiaClinica", "historiaInicial")
  );
}
