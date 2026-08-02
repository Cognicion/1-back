import { db } from "../../firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { indexarNota } from "./frequencyCounter.js";
import { cargarIndice, guardarIndice, actualizarNotaIndice } from "./patternPersistence.js";

const COLECCIONES = ["notasMedicas", "notas", "notasClinicas", "notasRapidas", "historiaClinica"];
const raices = ["usuarios", "pacientes"];
const valor = (d, claves) => claves.map((k) => d[k]).find(Boolean) || "";

export async function construirIndiceIncremental({ onProgress } = {}) {
  const indice = cargarIndice();
  const usuarios = await getDocs(collection(db, "usuarios"));
  let procesadas = 0, modificadas = 0;
  for (const usuario of usuarios.docs) {
    const perfil = usuario.data() || {};
    for (const raiz of raices) for (const nombreColeccion of COLECCIONES) {
      try {
        const snap = await getDocs(collection(db, raiz, usuario.id, nombreColeccion));
        snap.docs.forEach((docSnap) => {
          const datos = docSnap.data() || {};
          const id = `${raiz}:${usuario.id}:${nombreColeccion}:${docSnap.id}`;
          const nota = indexarNota({ ...datos, uidPaciente: valor(datos, ["uidPaciente", "pacienteUid", "idPaciente"]) || (perfil.rol === "paciente" ? usuario.id : ""), uidMedico: valor(datos, ["uidMedico", "medicoUid", "usuarioId"]) }, { id, pacienteUid: perfil.rol === "paciente" ? usuario.id : "" });
          procesadas++;
          if (indice.notas[id]?.firma !== nota.firma) { actualizarNotaIndice(indice, nota); modificadas++; }
        });
      } catch { /* colección ausente o no autorizada: continuar con las fuentes compatibles */ }
    }
    onProgress?.({ procesadas, modificadas });
  }
  indice.version = 1; indice.actualizadoEn = new Date().toISOString(); indice.totalNotas = Object.keys(indice.notas).length;
  guardarIndice(indice);
  return indice;
}
