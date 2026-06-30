import { auth } from "./firebase.js";
import { obtenerUsuario } from "./services/usuarios.js";
import { MEDICAMENTOS } from "./data/medicamentos.js";
import { CIE10 } from "./data/cie10.js";
import { CIE11 } from "./data/cie11.js";
import { CRITERIOS_DIAGNOSTICOS, PSICOEDUCACION } from "./data/bibliotecaClinica.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let tabActual = "diagnosticos";
let filtro = "";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);
  if (!usuario || usuario.rol !== "medico") {
    alert("Biblioteca disponible solo para medicos.");
    window.location.href = "dashboard.html";
    return;
  }

  document.body.classList.remove("bloqueado");
  render();
});

document.getElementById("buscadorBiblioteca").addEventListener("input", (e) => {
  filtro = e.target.value.toLowerCase().trim();
  render();
});

document.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    tabActual = btn.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("activo", b === btn));
    render();
  });
});

function coincide(texto) {
  return !filtro || String(texto).toLowerCase().includes(filtro);
}

function render() {
  const panel = document.getElementById("panelBiblioteca");
  if (tabActual === "vademecum") {
    panel.innerHTML = MEDICAMENTOS
      .filter((m) => coincide(`${m.nombre} ${m.clase} ${m.notas}`))
      .map((m) => `
        <article class="card">
          <h3>${m.nombre}</h3>
          <span class="tag">${m.clase}</span>
          <p><strong>Dosis habitual:</strong> ${m.dosisHabitual}</p>
          <p>${m.notas}</p>
        </article>
      `).join("");
    return;
  }

  if (tabActual === "psicoeducacion") {
    panel.innerHTML = PSICOEDUCACION
      .filter((p) => coincide(`${p.titulo} ${p.tema} ${p.texto}`))
      .map((p) => `
        <article class="card">
          <h3>${p.titulo}</h3>
          <span class="tag">${p.tema}</span>
          <p>${p.texto}</p>
        </article>
      `).join("");
    return;
  }

  const catalogo = [
    ...CIE10.map((dx) => ({ ...dx, catalogo: "CIE-10" })),
    ...CIE11.map((dx) => ({ ...dx, catalogo: "CIE-11" }))
  ];

  const tarjetasCriterios = CRITERIOS_DIAGNOSTICOS
    .filter((dx) => coincide(`${dx.codigo} ${dx.nombre} ${dx.categoria} ${dx.criterios.join(" ")}`))
    .map((dx) => `
      <article class="card">
        <h3>${dx.nombre}</h3>
        <span class="tag">${dx.codigo} · ${dx.categoria}</span>
        <ul>${dx.criterios.map((c) => `<li>${c}</li>`).join("")}</ul>
        <p><strong>Psicoeducacion:</strong> ${dx.psicoeducacion}</p>
      </article>
    `);

  const tarjetasCatalogo = catalogo
    .filter((dx) => coincide(`${dx.codigo} ${dx.nombre} ${dx.catalogo}`))
    .slice(0, 80)
    .map((dx) => `
      <article class="card">
        <h3>${dx.nombre}</h3>
        <span class="tag">${dx.catalogo} · ${dx.codigo}</span>
        <p>Criterios especificos no cargados aun. Usar como referencia de catalogo y complementar con entrevista clinica.</p>
      </article>
    `);

  panel.innerHTML = [...tarjetasCriterios, ...tarjetasCatalogo].join("") || "<p>No hay resultados.</p>";
}
