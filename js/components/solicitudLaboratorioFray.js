import { CATALOGO_FRAY_ANALISIS_CLINICOS } from "../catalogs/catalogoLaboratorioFray.js";

function escapar(valor = "") {
  return String(valor).replace(/[&<>"']/g, (caracter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[caracter]));
}

export function renderizarFormularioLaboratorioFray(contenedor, seleccionados = [], onChange = () => {}) {
  if (!contenedor) return;
  const seleccion = new Map((seleccionados || []).map((item) => [item.id, item]));
  contenedor.innerHTML = `
    <div class="solicitud-fray-lab-toolbar">
      <strong>Estudios a solicitar</strong>
      <span id="solicitudFrayLaboratorioContador" aria-live="polite"></span>
      <div class="solicitud-fray-lab-actions">
        <button type="button" class="boton-secundario" data-fray-lab-action="expandir">Expandir todos</button>
        <button type="button" class="boton-secundario" data-fray-lab-action="contraer">Contraer todos</button>
        <button type="button" class="boton-secundario" data-fray-lab-action="todos">Seleccionar todos</button>
        <button type="button" class="boton-secundario" data-fray-lab-action="limpiar">Limpiar selección</button>
      </div>
    </div>
    <div class="solicitud-fray-lab-categorias">
      ${CATALOGO_FRAY_ANALISIS_CLINICOS.map((categoria) => `
        <details class="solicitud-fray-lab-categoria">
          <summary><span>${escapar(categoria.nombre)}</span><small data-fray-lab-count="${escapar(categoria.id)}"></small></summary>
          <div class="solicitud-fray-lab-estudios">
            ${categoria.estudios.map((estudio) => `
              <label class="solicitud-fray-lab-estudio">
                <input type="checkbox" data-fray-lab-id="${escapar(estudio.id)}" ${seleccion.has(estudio.id) ? "checked" : ""}>
                <span>${escapar(estudio.nombre)}</span>
              </label>
              ${estudio.requiereTexto ? `<input class="solicitud-fray-lab-cultivo" data-fray-lab-cultivo="${escapar(estudio.id)}" placeholder="Especificar tipo de cultivo" value="${escapar(seleccion.get(estudio.id)?.texto || "")}" ${seleccion.has(estudio.id) ? "" : "hidden"}>` : ""}
            `).join("")}
          </div>
        </details>
      `).join("")}
    </div>`;

  const actualizar = () => {
    const valores = [...contenedor.querySelectorAll("[data-fray-lab-id]:checked")].map((input) => {
      const estudio = CATALOGO_FRAY_ANALISIS_CLINICOS.flatMap((categoria) => categoria.estudios.map((item) => ({ ...item, categoriaId: categoria.id }))).find((item) => item.id === input.dataset.frayLabId);
      const texto = contenedor.querySelector(`[data-fray-lab-cultivo="${CSS.escape(input.dataset.frayLabId)}"]`)?.value?.trim() || "";
      return { id: estudio.id, categoriaId: estudio.categoriaId, nombre: estudio.nombre, ...(texto ? { texto } : {}) };
    });
    contenedor.querySelectorAll("[data-fray-lab-cultivo]").forEach((campo) => {
      campo.hidden = !contenedor.querySelector(`[data-fray-lab-id="${CSS.escape(campo.dataset.frayLabCultivo)}"]`)?.checked;
    });
    const contador = contenedor.querySelector("#solicitudFrayLaboratorioContador");
    if (contador) contador.textContent = `${valores.length} seleccionados`;
    CATALOGO_FRAY_ANALISIS_CLINICOS.forEach((categoria) => {
      const count = valores.filter((item) => item.categoriaId === categoria.id).length;
      const nodo = contenedor.querySelector(`[data-fray-lab-count="${CSS.escape(categoria.id)}"]`);
      if (nodo) nodo.textContent = count ? `(${count} seleccionados)` : "";
    });
    onChange(valores);
  };

  contenedor.querySelectorAll("[data-fray-lab-id]").forEach((input) => input.addEventListener("change", actualizar));
  contenedor.querySelectorAll("[data-fray-lab-cultivo]").forEach((input) => input.addEventListener("input", actualizar));
  contenedor.querySelectorAll("[data-fray-lab-action]").forEach((boton) => boton.addEventListener("click", () => {
    const accion = boton.dataset.frayLabAction;
    if (accion === "expandir" || accion === "contraer") contenedor.querySelectorAll("details").forEach((detalle) => { detalle.open = accion === "expandir"; });
    if (accion === "todos") contenedor.querySelectorAll("[data-fray-lab-id]").forEach((input) => { input.checked = true; });
    if (accion === "limpiar") contenedor.querySelectorAll("[data-fray-lab-id]").forEach((input) => { input.checked = false; });
    actualizar();
  }));
  actualizar();
}
