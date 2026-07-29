import { db } from "../firebase.js";
import { collection, getDocs, orderBy, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function listarMedicosDelCatalogoDeFirmas(uidMedico = "") {
  if (!uidMedico) return [];
  const referencia = collection(db, "usuarios", uidMedico, "catalogoMedicosFirmas");
  const resultado = await getDocs(query(referencia, orderBy("nombre")));
  return resultado.docs.map((docMedico) => ({ id: docMedico.id, ...docMedico.data() }));
}

export function resolverMedicoDelCatalogo(nombre = "", catalogo = []) {
  const normalizar = (valor) => String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const clave = normalizar(nombre);
  return catalogo.find((medico) => normalizar(medico.nombre) === clave) || null;
}
