import { auth } from "./firebase.js";
import { CIE10 } from "./data/cie10.js";
import { CIE11 } from "./data/cie11.js";
import { MEDICAMENTOS } from "./data/medicamentos.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  obtenerUsuario,
  listarPacientes,
  actualizarUsuario
} from "./services/usuarios.js";

import {
  guardarNota,
  obtenerHistorialNotas,
  actualizarNota
} from "./services/notas.js";

let uidPacienteActual = null;
let diagnosticosSeleccionados = [];
let notaEditandoId = null;
let notasHistorial = {};

const buscadorDiagnostico = document.getElementById("buscadorDiagnostico");
const resultadosCIE10 = document.getElementById("resultadosCIE10");
const cie10Codigo = document.getElementById("cie10Codigo");
const cie10Nombre = document.getElementById("cie10Nombre");
const buscadorCIE10 = document.getElementById("buscadorCIE10");
const buscadorCIE11 = document.getElementById("buscadorCIE11");
const resultadosCIE10Lista = document.getElementById("resultadosCIE10Lista");
const resultadosCIE11Lista = document.getElementById("resultadosCIE11Lista");
const diagnosticoCatalogoVisible = document.getElementById("diagnosticoCatalogoVisible");
const catalogoDiagnosticos = [
  ...CIE10.map((dx) => ({ ...dx, catalogo: "CIE-10" })),
  ...CIE11.map((dx) => ({ ...dx, catalogo: "CIE-11" }))
];

function configurarBuscadorCatalogo(input, contenedor, catalogo, nombreCatalogo) {
  if (!input || !contenedor) return;

  input.addEventListener("input", () => {
    const texto = input.value.toLowerCase().trim();
    contenedor.innerHTML = "";

    if (texto.length < 2) return;

    catalogo
      .filter((dx) =>
        dx.codigo.toLowerCase().includes(texto) ||
        dx.nombre.toLowerCase().includes(texto)
      )
      .slice(0, 10)
      .forEach((dx) => {
        const item = document.createElement("div");
        item.classList.add("resultado-cie10");
        item.innerHTML = `<strong>${dx.codigo}</strong> <span>${nombreCatalogo}</span> - ${dx.nombre}`;
        item.addEventListener("click", () => {
          agregarDiagnostico({ ...dx, catalogo: nombreCatalogo });
          input.value = "";
          contenedor.innerHTML = "";
        });
        contenedor.appendChild(item);
      });
  });
}

configurarBuscadorCatalogo(buscadorCIE10, resultadosCIE10Lista, CIE10, "CIE-10");
configurarBuscadorCatalogo(buscadorCIE11, resultadosCIE11Lista, CIE11, "CIE-11");

if (buscadorDiagnostico && resultadosCIE10 && cie10Codigo && cie10Nombre) {
  buscadorDiagnostico.addEventListener("input", () => {
    const texto = buscadorDiagnostico.value.toLowerCase().trim();

    resultadosCIE10.innerHTML = "";

    if (texto.length < 2) return;

    const resultados = catalogoDiagnosticos.filter((dx) => {
      return (
        dx.codigo.toLowerCase().includes(texto) ||
        dx.nombre.toLowerCase().includes(texto)
      );
    }).slice(0, 10);

    resultados.forEach((dx) => {
      const item = document.createElement("div");
      item.classList.add("resultado-cie10");

      item.innerHTML = `
        <strong>${dx.codigo}</strong> <span>${dx.catalogo}</span> - ${dx.nombre}
      `;

      item.addEventListener("click", () => {
        agregarDiagnostico(dx);
        buscadorDiagnostico.value = "";
        resultadosCIE10.innerHTML = "";
      });

      resultadosCIE10.appendChild(item);
    });
  });
}

const buscadorMedicamento = document.getElementById("buscadorMedicamento");
const resultadosMedicamentos = document.getElementById("resultadosMedicamentos");

if (buscadorMedicamento && resultadosMedicamentos) {
  buscadorMedicamento.addEventListener("input", () => {
    const texto = buscadorMedicamento.value.toLowerCase().trim();
    resultadosMedicamentos.innerHTML = "";

    if (texto.length < 2) return;

    MEDICAMENTOS.filter((med) =>
      med.nombre.toLowerCase().includes(texto) ||
      med.clase.toLowerCase().includes(texto)
    ).slice(0, 10).forEach((med) => {
      const item = document.createElement("div");
      item.className = "resultado-cie10";
      item.innerHTML = `<strong>${med.nombre}</strong> - ${med.clase}<br><small>${med.dosisHabitual} | ${med.notas}</small>`;
      item.addEventListener("click", () => {
        const tratamiento = document.getElementById("tratamiento");
        const textoMed = `${med.nombre} (${med.clase}) - ${med.dosisHabitual}. ${med.notas}`;
        tratamiento.value = tratamiento.value
          ? `${tratamiento.value}\n${textoMed}`
          : textoMed;
        buscadorMedicamento.value = "";
        resultadosMedicamentos.innerHTML = "";
      });
      resultadosMedicamentos.appendChild(item);
    });
  });
}

function agregarDiagnostico(dx) {
  const yaExiste = diagnosticosSeleccionados.some(
    (item) =>
      item.codigo === dx.codigo &&
      (item.catalogo || "CIE-10") === (dx.catalogo || "CIE-10")
  );

  if (yaExiste) {
    alert("Este diagnóstico ya está seleccionado");
    return;
  }

  const nuevoDiagnostico = {
    codigo: dx.codigo,
    nombre: dx.nombre,
    catalogo: dx.catalogo || "CIE-10",
    texto: `${dx.codigo} - ${dx.nombre}`,
    fechaSeleccion: new Date().toISOString()
  };

  diagnosticosSeleccionados.push(nuevoDiagnostico);

  cie10Codigo.value = dx.codigo;
  cie10Nombre.value = dx.nombre;

  renderizarDiagnosticosSeleccionados();
}

function renderizarDiagnosticosSeleccionados() {
  const contenedor = document.getElementById("diagnosticosSeleccionados");

  if (!contenedor) return;

  contenedor.innerHTML = "";

  if (diagnosticosSeleccionados.length === 0) {
    contenedor.innerHTML = `
      <p style="color:#999;">No hay diagnósticos seleccionados</p>
    `;
    return;
  }

  ["CIE-10", "CIE-11"].forEach((catalogo) => {
    const diagnosticos = diagnosticosSeleccionados
      .map((dx, index) => ({ ...dx, index }))
      .filter((dx) => (dx.catalogo || "CIE-10") === catalogo);

    if (diagnosticos.length === 0) return;

    contenedor.innerHTML += `<h4 class="diagnostico-catalogo-titulo">${catalogo}</h4>`;

    diagnosticos.forEach((dx) => {
      contenedor.innerHTML += `
        <div class="diagnostico-item">
          <span>${dx.texto}</span>

          <button type="button" onclick="eliminarDiagnostico(${dx.index})">
            Eliminar diagnóstico
          </button>
        </div>
      `;
    });
  });
}

window.eliminarDiagnostico = function(index) {
  const confirmar = confirm("¿Eliminar diagnóstico?");

  if (!confirmar) return;

  diagnosticosSeleccionados.splice(index, 1);

  renderizarDiagnosticosSeleccionados();
};

function diagnosticoActual() {
  if (diagnosticosSeleccionados.length === 0) return null;

  const catalogoVisible = diagnosticoCatalogoVisible?.value || "auto";

  if (catalogoVisible !== "auto") {
    const diagnostico = [...diagnosticosSeleccionados]
      .reverse()
      .find((dx) => (dx.catalogo || "CIE-10") === catalogoVisible);

    if (diagnostico) return diagnostico;
  }

  return diagnosticosSeleccionados[diagnosticosSeleccionados.length - 1];
}

function textoDiagnosticos() {
  if (diagnosticosSeleccionados.length === 0) return "";

  return diagnosticosSeleccionados
    .map((dx) => dx.texto)
    .join("\n");
}

const tipoNota = document.getElementById("tipoNota");
const bloqueNotaRapida = document.getElementById("bloqueNotaRapida");
const bloqueNotaCompleta = document.getElementById("bloqueNotaCompleta");
const btnCancelarEdicion = document.getElementById("btnCancelarEdicion");

function sincronizarTipoNota() {
  const esRapida = tipoNota?.value === "rapida";
  bloqueNotaRapida?.classList.toggle("oculto", !esRapida);
  bloqueNotaCompleta?.classList.toggle("oculto", esRapida);
}

tipoNota?.addEventListener("change", sincronizarTipoNota);
sincronizarTipoNota();

function leerFormularioNota() {
  return {
    tipoNota: tipoNota?.value || "completa",
    notaRapida: document.getElementById("notaRapida")?.value || "",
    subjetivo: document.getElementById("subjetivo").value,
    objetivo: document.getElementById("objetivo").value,
    analisis: document.getElementById("analisis").value,
    plan: document.getElementById("plan").value
  };
}

function llenarFormularioNota(datos) {
  if (tipoNota) tipoNota.value = datos.tipoNota || (datos.notaRapida ? "rapida" : "completa");
  document.getElementById("notaRapida").value = datos.notaRapida || "";
  document.getElementById("subjetivo").value = datos.subjetivo || "";
  document.getElementById("objetivo").value = datos.objetivo || "";
  document.getElementById("analisis").value = datos.analisis || "";
  document.getElementById("plan").value = datos.plan || "";
  sincronizarTipoNota();
}

function limpiarFormularioNota() {
  notaEditandoId = null;
  llenarFormularioNota({ tipoNota: "completa" });
  btnCancelarEdicion?.classList.add("oculto");
}

window.cancelarEdicionNota = function() {
  limpiarFormularioNota();
};

function bloqueContenidoNota(datos, titulo) {
  const esRapida = datos.tipoNota === "rapida" || datos.notaRapida;
  return `
    <div class="version-nota">
      <h4>${titulo}</h4>
      ${esRapida ? `<p><b>Nota rapida:</b><br>${escaparHTML(datos.notaRapida || "")}</p>` : `
        <p><b>Subjetivo:</b><br>${escaparHTML(datos.subjetivo || "")}</p>
        <p><b>Objetivo:</b><br>${escaparHTML(datos.objetivo || "")}</p>
        <p><b>Analisis:</b><br>${escaparHTML(datos.analisis || "")}</p>
        <p><b>Plan:</b><br>${escaparHTML(datos.plan || "")}</p>
      `}
    </div>
  `;
}

window.editarNotaDesdeHistorial = function(notaId) {
  const datos = notasHistorial[notaId];
  if (!datos) return;
  notaEditandoId = notaId;
  llenarFormularioNota(datos.notaEditada || datos);
  btnCancelarEdicion?.classList.remove("oculto");
  document.getElementById("tipoNota")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);

  if (!usuario || usuario.rol !== "medico") {
    alert("Acceso restringido al personal médico");
    window.location.href = "dashboard.html";
    return;
  }

  const parametros = new URLSearchParams(window.location.search);
  uidPacienteActual = parametros.get("id");

  if (uidPacienteActual) {
    const bloqueSelector = document.getElementById("bloqueSelectorPaciente");

    if (bloqueSelector) {
      bloqueSelector.style.display = "none";
    }

    await cargarPaciente(uidPacienteActual);
    await cargarHistorial(uidPacienteActual);
  } else {
    await cargarListaPacientes();
  }
});

async function cargarListaPacientes() {
  const selector = document.getElementById("uidPaciente");

  if (!selector) return;

  const pacientes = await listarPacientes();

  pacientes.forEach((paciente) => {
    const datos = paciente.data();
    const opcion = document.createElement("option");

    opcion.value = paciente.id;
    opcion.textContent = datos.nombre || "Sin nombre";

    selector.appendChild(opcion);
  });

  selector.addEventListener("change", async () => {
    uidPacienteActual = selector.value;

    await cargarPaciente(uidPacienteActual);
    await cargarHistorial(uidPacienteActual);
  });
}

async function cargarPaciente(uidPaciente) {
  const datos = await obtenerUsuario(uidPaciente);

  if (!datos) return;

  const tratamiento = document.getElementById("tratamiento");
  const medico = document.getElementById("medico");
  const ultimaConsulta = document.getElementById("ultimaConsulta");
  const proximaConsulta = document.getElementById("proximaConsulta");

  diagnosticosSeleccionados = [];

  if (Array.isArray(datos.historialDiagnosticos)) {
    diagnosticosSeleccionados = datos.historialDiagnosticos;
  } else if (typeof datos.diagnostico === "object" && datos.diagnostico !== null) {
    diagnosticosSeleccionados = [datos.diagnostico];
  } else if (typeof datos.diagnostico === "string" && datos.diagnostico.trim() !== "") {
    diagnosticosSeleccionados = [
      {
        codigo: "",
        nombre: datos.diagnostico,
        texto: datos.diagnostico,
        fechaSeleccion: new Date().toISOString()
      }
    ];
  }

  renderizarDiagnosticosSeleccionados();

  const dxActual = diagnosticoActual();

  if (buscadorDiagnostico) {
    buscadorDiagnostico.value = dxActual?.texto || "";
  }

  if (cie10Codigo) {
    cie10Codigo.value = dxActual?.codigo || "";
  }

  if (cie10Nombre) {
    cie10Nombre.value = dxActual?.nombre || "";
  }

  if (tratamiento) tratamiento.value = datos.tratamiento || "";
  if (medico) medico.value = datos.medicoTratante || "";
  if (ultimaConsulta) ultimaConsulta.value = datos.ultimaConsulta || "";
  if (proximaConsulta) proximaConsulta.value = datos.proximaConsulta || "";
  if (diagnosticoCatalogoVisible) {
    diagnosticoCatalogoVisible.value = datos.diagnosticoCatalogoVisible || "auto";
  }
}

window.guardarNotaMedica = async function() {
  const selector = document.getElementById("uidPaciente");
  const uidPaciente = uidPacienteActual || selector?.value;

  if (!uidPaciente) {
    alert("Selecciona un paciente");
    return;
  }

  const diagnostico = diagnosticoActual();

  const tratamiento = document.getElementById("tratamiento").value;
  const medico = document.getElementById("medico").value;
  const ultimaConsulta = document.getElementById("ultimaConsulta").value;
  const proximaConsulta = document.getElementById("proximaConsulta").value;

  const datosNotaClinica = leerFormularioNota();
  const catalogoVisible = diagnosticoCatalogoVisible?.value || "auto";

  try {
    await actualizarUsuario(uidPaciente, {
      diagnostico,
      diagnosticoCatalogoVisible: catalogoVisible,
      diagnosticos: diagnosticosSeleccionados,
      historialDiagnosticos: diagnosticosSeleccionados,
      tratamiento,
      medicoTratante: medico,
      ultimaConsulta,
      proximaConsulta
    });

    const notaPayload = {
      autor: medico,
      ...datosNotaClinica,
      diagnostico,
      diagnosticoCatalogoVisible: catalogoVisible,
      diagnosticos: diagnosticosSeleccionados,
      historialDiagnosticos: diagnosticosSeleccionados,
      tratamiento,
      ultimaConsulta,
      proximaConsulta
    };

    if (notaEditandoId) {
      await actualizarNota(uidPaciente, notaEditandoId, {
        ...notaPayload,
        fechaEdicion: new Date().toISOString()
      });
    } else {
      await guardarNota(uidPaciente, notaPayload);
    }

    alert(notaEditandoId ? "Edicion guardada sin borrar la nota original" : "Nota medica guardada correctamente");
    limpiarFormularioNota();

    await cargarHistorial(uidPaciente);

  } catch(error) {
    alert("Error: " + error.message);
  }
};

async function cargarHistorial(uidPaciente) {
  const contenedor = document.getElementById("historialNotas");

  if (!contenedor) return;

  contenedor.innerHTML = "";
  notasHistorial = {};

  const notas = await obtenerHistorialNotas(uidPaciente);

  if (notas.empty) {
    contenedor.innerHTML = `
      <p style="color:#999">
        No hay notas registradas
      </p>
    `;
    return;
  }

  notas.forEach((nota) => {
    const datos = nota.data();
    notasHistorial[nota.id] = datos;

    const fecha = new Date(datos.fecha);

    const fechaTexto = fecha.toLocaleDateString("es-MX");

    const horaTexto = fecha.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit"
    });

    let diagnosticosTexto = "";

    if (Array.isArray(datos.historialDiagnosticos)) {
      diagnosticosTexto = datos.historialDiagnosticos
        .map((dx) => dx.texto || "")
        .join("<br>");
    } else if (typeof datos.diagnostico === "object" && datos.diagnostico !== null) {
      diagnosticosTexto = datos.diagnostico.texto || "";
    } else {
      diagnosticosTexto = datos.diagnostico || "";
    }

    contenedor.innerHTML += `
      <details style="
        background:#0d0d0d;
        border:1px solid #333;
        border-radius:20px;
        padding:22px;
        margin-bottom:20px;
      ">

        <summary style="
          cursor:pointer;
          font-size:18px;
          font-weight:bold;
          outline:none;
        ">
          ${fechaTexto} · ${horaTexto} · ${datos.autor || "Sin médico"}
        </summary>

        <div style="margin-top:20px;">

          <p><b>Diagnósticos:</b><br>
            ${diagnosticosTexto}
          </p>

          ${bloqueContenidoNota(datos, "Nota original")}

          ${datos.notaEditada ? bloqueContenidoNota(datos.notaEditada, "Version editada") : ""}

          <button type="button" class="boton-secundario" onclick="editarNotaDesdeHistorial('${nota.id}')">
            Editar esta nota
          </button>

        </div>

      </details>
    `;
  });
}

window.regresarDesdeNota = function() {
  if (uidPacienteActual) {
    window.location.href = `paciente.html?id=${uidPacienteActual}`;
  } else {
    window.location.href = "medico.html";
  }
};

window.generarPDFNota = function() {
  window.print();
};
