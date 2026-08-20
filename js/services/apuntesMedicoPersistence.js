import {
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  validarRevisionApunte
} from "../apuntes-revision.js";

export {
  CODIGO_CONFLICTO_APUNTE,
  CODIGO_APUNTE_ELIMINADO,
  esConflictoApunte,
  esErrorConexionApunte
} from "../apuntes-revision.js";

export async function actualizarApunteConRevision({ db, referencia, payload, fechaEsperada }) {
  await runTransaction(db, async (transaccion) => {
    const actual = await transaccion.get(referencia);
    validarRevision(actual, fechaEsperada);
    transaccion.update(referencia, payload);
  });
}

export async function eliminarApunteConRevision({ db, referencia, fechaEsperada }) {
  await runTransaction(db, async (transaccion) => {
    const actual = await transaccion.get(referencia);
    validarRevision(actual, fechaEsperada);
    transaccion.delete(referencia);
  });
}

function validarRevision(actual, fechaEsperada) {
  validarRevisionApunte({
    existe: actual.exists(),
    fechaActualizacion: actual.exists() ? actual.data().fechaActualizacion : ""
  }, fechaEsperada);
}
