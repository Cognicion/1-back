import { obtenerTipoColaborador, reconocimientoColaboradorActivo } from "../config/tiposColaborador.js";

const CONTACTO = Object.freeze({
  correo: "aldo.sandokan@gmail.com",
  principal: { texto: "669 197 1091", href: "+526691971091" },
  alternativos: [
    ["Cognición Labs Soporte 2", "66 99 94 42 10", "+526699944210"],
    ["Cognición Labs Soporte 3", "44 94 75 60 33", "+524494756033"],
    ["Cognición Labs Soporte 4", "33 10 43 15 52", "+523310431552"],
    ["Cognición Labs Soporte 5", "33 33 75 15 03", "+523333751503"],
    ["Cognición Labs Soporte 6", "33 33 06 69 81", "+523333066981"],
    ["Cognición Labs Soporte 7", "99 92 34 20 72", "+529992342072"]
  ]
});

function escapar(valor) {
  return String(valor || "").replace(/[&<>"']/g, (caracter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[caracter]));
}

function renderizarContactos() {
  return `
    <details class="reconocimiento-contactos">
      <summary>Contacto directo</summary>
      <div class="reconocimiento-contactos-contenido">
        <p><strong>Aldo Sandokan</strong><br>Correo: <a href="mailto:${CONTACTO.correo}">${CONTACTO.correo}</a></p>
        <p><strong>Soporte principal</strong><br><a href="tel:${CONTACTO.principal.href}">${CONTACTO.principal.texto}</a></p>
        <p><strong>Canales alternativos</strong></p>
        ${CONTACTO.alternativos.map(([nombre, texto, href]) => `<p><strong>${escapar(nombre)}</strong><br><a href="tel:${href}">${escapar(texto)}</a></p>`).join("")}
      </div>
    </details>
  `;
}

export function renderizarReconocimientoColaborador({ contenedor, colaborador }) {
  if (!contenedor) return false;
  if (!reconocimientoColaboradorActivo(colaborador)) {
    contenedor.replaceChildren();
    contenedor.hidden = true;
    return false;
  }

  const tipo = obtenerTipoColaborador(colaborador.tipo);
  contenedor.innerHTML = `
    <article class="reconocimiento-colaborador ${escapar(tipo.clase)}" aria-label="${escapar(tipo.titulo)}">
      <div class="reconocimiento-colaborador-cabecera">
        <span class="reconocimiento-icono" aria-hidden="true">${tipo.icono}</span>
        <div><p class="reconocimiento-kicker">Reconocimiento y colaboración</p><h2>${escapar(tipo.titulo)}</h2></div>
      </div>
      <p>${escapar(tipo.mensaje)}</p>
      ${tipo.mostrarContactos ? renderizarContactos() : ""}
    </article>
  `;
  contenedor.hidden = false;
  console.debug("[colaborador] reconocimiento renderizado", colaborador.tipo);
  return true;
}
