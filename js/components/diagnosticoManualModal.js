const ESTADOS_DIAGNOSTICO_MANUAL = [
  "Se agrega",
  "Se descarta",
  "Probable",
  "A descartar",
  "Confirmado",
  "En seguimiento",
  "Antecedente",
  "Remisión",
  "Diferencial"
];

let modalDiagnosticoManual;

function escaparHTML(valor = "") {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function obtenerModalDiagnosticoManual() {
  if (modalDiagnosticoManual?.isConnected) return modalDiagnosticoManual;

  modalDiagnosticoManual = document.createElement("dialog");
  modalDiagnosticoManual.className = "diagnostico-manual-modal";
  modalDiagnosticoManual.setAttribute("aria-labelledby", "diagnosticoManualModalTitulo");
  modalDiagnosticoManual.innerHTML = `
    <form method="dialog" class="diagnostico-manual-modal__form">
      <header class="diagnostico-manual-modal__encabezado">
        <div>
          <h2 id="diagnosticoManualModalTitulo">Agregar diagnóstico manual</h2>
          <p>El diagnóstico se agrega a esta nota y al expediente del paciente al guardar.</p>
        </div>
        <button type="button" class="diagnostico-manual-modal__cerrar" aria-label="Cerrar" data-accion="cerrar">×</button>
      </header>
      <div class="diagnostico-manual-modal__campos">
        <label>Nombre del diagnóstico
          <input name="nombre" required autocomplete="off" maxlength="240">
        </label>
        <label>Sistema de clasificación
          <select name="catalogo">
            <option value="CIE-10">CIE-10</option>
            <option value="CIE-11">CIE-11</option>
            <option value="DSM-5">DSM-5</option>
            <option value="Otro">Otro</option>
          </select>
        </label>
        <label>Código <small>Opcional</small>
          <input name="codigo" autocomplete="off" maxlength="80">
        </label>
        <label>Estado diagnóstico
          <select name="estado">
            ${ESTADOS_DIAGNOSTICO_MANUAL.map((estado) => `<option value="${escaparHTML(estado)}">${escaparHTML(estado)}</option>`).join("")}
          </select>
        </label>
        <label class="diagnostico-manual-modal__ancho-completo">Descripción <small>Opcional</small>
          <textarea name="descripcion" rows="3"></textarea>
        </label>
        <label class="diagnostico-manual-modal__ancho-completo">Observaciones <small>Opcional</small>
          <textarea name="observaciones" rows="3"></textarea>
        </label>
      </div>
      <label class="diagnostico-manual-modal__biblioteca">
        <input name="incluirEnCatalogo" type="checkbox">
        <span>Agregar también a la Biblioteca clínica</span>
      </label>
      <p class="diagnostico-manual-modal__error" role="alert" hidden></p>
      <footer class="diagnostico-manual-modal__acciones">
        <button type="button" class="boton-secundario" data-accion="cerrar">Cancelar</button>
        <button type="submit">Agregar diagnóstico</button>
      </footer>
    </form>
  `;
  document.body.append(modalDiagnosticoManual);
  return modalDiagnosticoManual;
}

/**
 * Presenta el formulario manual compartido. La pantalla que lo invoca conserva
 * su propio adaptador de guardado y recibe un objeto sin referencias al DOM.
 */
export function abrirModalDiagnosticoManual({ alGuardar } = {}) {
  if (typeof alGuardar !== "function") throw new TypeError("alGuardar debe ser una función");

  const modal = obtenerModalDiagnosticoManual();
  const formulario = modal.querySelector("form");
  const error = modal.querySelector(".diagnostico-manual-modal__error");
  formulario.reset();
  error.hidden = true;

  const cerrar = () => modal.close();
  modal.querySelectorAll('[data-accion="cerrar"]').forEach((boton) => {
    boton.onclick = cerrar;
  });
  modal.onclick = (evento) => {
    if (evento.target === modal) cerrar();
  };
  formulario.onsubmit = async (evento) => {
    evento.preventDefault();
    const datos = new FormData(formulario);
    const nombre = String(datos.get("nombre") || "").trim();
    if (!nombre) {
      error.textContent = "Indica el nombre del diagnóstico.";
      error.hidden = false;
      formulario.elements.nombre.focus();
      return;
    }

    const botonGuardar = formulario.querySelector('[type="submit"]');
    botonGuardar.disabled = true;
    error.hidden = true;
    try {
      await alGuardar({
        nombre,
        catalogo: String(datos.get("catalogo") || "Otro"),
        codigo: String(datos.get("codigo") || "").trim(),
        descripcion: String(datos.get("descripcion") || "").trim(),
        observaciones: String(datos.get("observaciones") || "").trim(),
        estado: String(datos.get("estado") || ""),
        incluirEnCatalogo: datos.get("incluirEnCatalogo") === "on"
      });
      cerrar();
    } catch (causa) {
      error.textContent = causa?.message || "No se pudo agregar el diagnóstico.";
      error.hidden = false;
    } finally {
      botonGuardar.disabled = false;
    }
  };

  if (!modal.open) modal.showModal();
  requestAnimationFrame(() => formulario.elements.nombre.focus());
}
