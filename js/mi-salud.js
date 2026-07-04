import { auth, db } from "./firebase.js";
import { ESCALAS_PSIQUIATRICAS, interpretarEscala } from "./data/escalasPsiquiatricas.js";
import {
  calcularPuntajeEscala,
  formatearFechaEscala,
  guardarEscalaAplicada,
  listarEscalasAplicadas,
  obtenerOpcionesItemEscala,
  textoItemEscala
} from "./services/escalas.js";
import { medicoPuedeVer, obtenerUsuario } from "./services/usuarios.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { crearCodigoPacienteParaMedico } from "./services/vinculacion.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let usuarioActual = null;
let uidSeguimiento = null;
let modoVistaPrevia = false;
let rolActual = "";
let escalasDisponibles = [];

iniciarMonitoreoSesion("Mi Salud");

onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    usuarioActual = user;
    const snapUsuario = await getDoc(doc(db, "usuarios", user.uid));

    if (!snapUsuario.exists()) {
      alert("No se encontro tu perfil.");
      window.location.href = "dashboard.html";
      return;
    }

    const datos = snapUsuario.data();
    const parametros = new URLSearchParams(window.location.search);
    const pacientePreview = parametros.get("paciente");
    modoVistaPrevia = parametros.get("preview") === "1" && Boolean(pacientePreview);
    uidSeguimiento = user.uid;
    let datosSeguimiento = datos;

    if (modoVistaPrevia) {
      if (datos.rol !== "medico") {
        alert("La vista previa de Mi Salud es solo para medicos.");
        window.location.href = "dashboard.html";
        return;
      }

      const autorizado = await medicoPuedeVer(user.uid, pacientePreview);
      if (!autorizado) {
        alert("No tienes permiso para previsualizar Mi Salud de este paciente.");
        window.location.href = "medico.html";
        return;
      }

      const snapPaciente = await getDoc(doc(db, "usuarios", pacientePreview));
      if (!snapPaciente.exists()) {
        alert("Paciente no encontrado.");
        window.location.href = "medico.html";
        return;
      }

      uidSeguimiento = pacientePreview;
      datosSeguimiento = snapPaciente.data();
      document.body.classList.add("modo-preview");
    } else if (!["paciente", "medico"].includes(datos.rol)) {
      alert("Este modulo esta disponible para pacientes y medicos.");
      window.location.href = "dashboard.html";
      return;
    }

    document.body.classList.remove("bloqueado");
    rolActual = datos.rol || "";
    await cargarMiSalud(uidSeguimiento, datosSeguimiento, rolActual);
    await configurarEscalas();
    await cargarResultadosEscalas(uidSeguimiento);
    await cargarUltimoRegistro(uidSeguimiento);
    await cargarTareasMiSalud(uidSeguimiento);
    await cargarTareasDiariasMiSalud(uidSeguimiento);
    await cargarCalendarioMiSalud(uidSeguimiento);
    await cargarDiarioPersonal(uidSeguimiento);

    document.getElementById("guardarRegistro")?.addEventListener("click", guardarRegistroDiario);
    document.getElementById("guardarEscala")?.addEventListener("click", guardarResultadoEscala);
    document.getElementById("guardarDiario")?.addEventListener("click", guardarDiarioPersonal);
    document.getElementById("guardarTareasDiarias")?.addEventListener("click", guardarTareasDiariasMiSalud);
    document.getElementById("btnGenerarCodigoMedico")?.addEventListener("click", generarCodigoParaMedico);
  } catch (error) {
    console.error("Error al cargar Mi Salud:", error);
    alert("Ocurrio un error al cargar Mi Salud.");
  }
});

async function cargarMiSalud(uid, datosUsuario, rolActual) {
  ponerTexto("nombrePaciente", datosUsuario.nombre || datosUsuario.email || "usuario");

  ponerTexto(
    "resumenSalud",
    modoVistaPrevia
      ? "Vista previa clinica de Mi Salud del paciente. Los registros personales no se editan desde aqui."
      : rolActual === "medico"
        ? "Aqui puedes llevar tu propio seguimiento de bienestar, registros diarios y escalas clinicas."
        : "Aqui podras revisar tu tratamiento, metas, citas y registrar como te sientes dia a dia."
  );

  ponerTexto("proximaCita", "No hay proxima cita registrada.");
  await cargarTratamiento(uid);
  await cargarMetas(uid);
  await cargarProximaCita(uid, datosUsuario);

  if (modoVistaPrevia) {
    document.getElementById("vinculacionCuentaCard")?.classList.add("oculto");
    document.getElementById("guardarRegistro")?.setAttribute("disabled", "disabled");
    document.getElementById("guardarEscala")?.setAttribute("disabled", "disabled");
    document.getElementById("guardarDiario")?.setAttribute("disabled", "disabled");
    document.getElementById("diarioTexto")?.setAttribute("disabled", "disabled");
    document.getElementById("diarioVisibleMedico")?.setAttribute("disabled", "disabled");
  }
}

async function generarCodigoParaMedico() {
  if (modoVistaPrevia || !usuarioActual) return;

  const contenedor = document.getElementById("codigoPacienteMedico");
  const boton = document.getElementById("btnGenerarCodigoMedico");

  try {
    if (boton) boton.textContent = "Generando...";
    const codigo = await crearCodigoPacienteParaMedico(usuarioActual.uid);
    if (contenedor) contenedor.textContent = codigo;

    const datosUsuario = await obtenerUsuario(usuarioActual.uid);
    await registrarEventoAuditoria({
      accion: "generar_codigo_paciente_para_medico",
      modulo: "Mi Salud",
      descripcion: "El paciente genero un codigo para vincular su cuenta con un expediente medico previo.",
      usuarioUid: usuarioActual.uid,
      usuarioNombre: datosUsuario?.nombre || usuarioActual.email || "",
      usuarioRol: datosUsuario?.rol || "",
      pacienteUid: usuarioActual.uid,
      pacienteNombre: datosUsuario?.nombre || "",
      exito: true,
      detalles: { codigo }
    });
  } catch (error) {
    alert("No se pudo generar el codigo: " + error.message);
  } finally {
    if (boton) boton.textContent = "Generar codigo";
  }
}

async function configurarEscalas() {
  const selector = document.getElementById("selectorEscala");
  if (!selector) return;

  escalasDisponibles = await obtenerEscalasDisponibles();

  if (!escalasDisponibles.length) {
    selector.innerHTML = `<option value="">Sin escalas visibles</option>`;
    selector.disabled = true;
    document.getElementById("guardarEscala")?.setAttribute("disabled", "disabled");
    const descripcion = document.getElementById("descripcionEscala");
    const items = document.getElementById("itemsEscala");
    if (descripcion) descripcion.textContent = "Aun no hay escalas activadas por tu medico.";
    if (items) items.innerHTML = "";
    return;
  }

  selector.disabled = modoVistaPrevia;
  document.getElementById("guardarEscala")?.toggleAttribute("disabled", modoVistaPrevia);
  selector.innerHTML = escalasDisponibles
    .map((escala) => `<option value="${escala.id}">${escala.nombre} - ${escala.area}</option>`)
    .join("");

  selector.addEventListener("change", renderizarEscalaSeleccionada);
  renderizarEscalaSeleccionada();
}

function escalaActual() {
  const id = document.getElementById("selectorEscala")?.value;
  return escalasDisponibles.find((escala) => escala.id === id) || escalasDisponibles[0];
}

async function obtenerEscalasDisponibles() {
  if (rolActual === "medico" && !modoVistaPrevia) {
    return ESCALAS_PSIQUIATRICAS;
  }

  const snap = await getDocs(collection(db, "usuarios", uidSeguimiento, "escalasAsignadas"));
  const visibles = new Set(
    snap.docs
      .map((docEscala) => docEscala.data())
      .filter((escala) => escala.visiblePaciente === true)
      .map((escala) => escala.escalaId)
  );

  return ESCALAS_PSIQUIATRICAS.filter((escala) => visibles.has(escala.id));
}

function renderizarEscalaSeleccionada() {
  const escala = escalaActual();
  const descripcion = document.getElementById("descripcionEscala");
  const items = document.getElementById("itemsEscala");
  if (!escala || !descripcion || !items) return;

  const intro = escala.introduccion ? `<p>${escala.introduccion}</p>` : "";
  const consideraciones = Array.isArray(escala.consideraciones) && escala.consideraciones.length
    ? `<div class="consideraciones-escala"><strong>Consideraciones clinicas</strong><ul>${escala.consideraciones.map((item) => `<li>${item}</li>`).join("")}</ul></div>`
    : "";

  descripcion.innerHTML = `
    <strong>${escala.nombre}</strong> - ${escala.area}<br>
    ${escala.descripcion}<br>
    <small>Rango: ${escala.rango}. Esto no sustituye valoracion clinica.</small>
    ${intro}
    ${consideraciones}
  `;

  items.innerHTML = escala.items.map((item, index) => {
    const opciones = obtenerOpcionesItemEscala(escala, item);
    return `
      <div class="item-escala">
        <label>${index + 1}. ${textoItemEscala(item)}
          <select data-item-escala="${index}" ${modoVistaPrevia ? "disabled" : ""}>
            <option value="">Seleccionar</option>
            ${opciones.map((opcion) => `<option value="${opcion.valor}">${opcion.texto}</option>`).join("")}
          </select>
        </label>
      </div>
    `;
  }).join("");
}

async function guardarResultadoEscala() {
  if (modoVistaPrevia) {
    alert("La vista previa del medico es de solo lectura.");
    return;
  }

  const escala = escalaActual();
  if (!escala || !usuarioActual || !uidSeguimiento) return;

  const selects = [...document.querySelectorAll("[data-item-escala]")];
  const respuestas = selects.map((select, index) => ({
    item: textoItemEscala(escala.items[index]),
    valor: select.value === "" ? null : Number(select.value),
    respuesta: select.options[select.selectedIndex]?.textContent || ""
  }));

  if (respuestas.some((r) => r.valor === null)) {
    alert("Responde todos los reactivos de la escala.");
    return;
  }

  const puntaje = calcularPuntajeEscala(respuestas);
  const interpretacion = interpretarEscala(escala, puntaje);
  const datosUsuario = await obtenerUsuario(usuarioActual.uid);
  const datosPaciente = await obtenerUsuario(uidSeguimiento);
  const fechaAplicacion = new Date().toISOString();

  await guardarEscalaAplicada(uidSeguimiento, {
    escalaId: escala.id,
    uidMedico: usuarioActual.uid,
    nombrePaciente: datosPaciente?.nombre || "",
    nombreEscala: escala.nombre,
    tipoEscala: escala.area,
    fechaAplicacion,
    origen: "modulo_escalas",
    puntajeTotal: puntaje,
    rango: escala.rango,
    interpretacion,
    respuestasPorItem: respuestas,
    observaciones: "",
    observacionesOpcionales: "",
    idNota: ""
  });

  await registrarEventoAuditoria({
    accion: "guardar_resultado_escala",
    modulo: "Mi Salud",
    descripcion: "El usuario guardo un resultado de escala clinica.",
    usuarioUid: usuarioActual.uid,
    usuarioNombre: datosUsuario?.nombre || usuarioActual.email || "",
    usuarioRol: datosUsuario?.rol || "",
    pacienteUid: uidSeguimiento,
    pacienteNombre: datosPaciente?.nombre || "",
    exito: true,
    detalles: {
      escalaId: escala.id,
      escalaNombre: escala.nombre,
      puntaje,
      interpretacion
    }
  });

  alert(`Resultado guardado: ${escala.nombre} = ${puntaje} (${interpretacion})`);
  renderizarEscalaSeleccionada();
  await cargarResultadosEscalas(uidSeguimiento);
}

async function cargarTareasMiSalud(uid) {
  const contenedor = document.getElementById("listaTareasMiSalud");
  if (!contenedor) return;

  try {
    const q = query(
      collection(db, "usuarios", uid, "tareasMiSalud"),
      orderBy("fechaISO", "desc"),
      limit(20)
    );
    const snap = await getDocs(q);
    const tareas = snap.docs
      .map((docTarea) => ({ id: docTarea.id, ...docTarea.data() }))
      .filter((tarea) => tarea.visiblePaciente !== false);

    if (!tareas.length) {
      contenedor.textContent = "Sin tareas asignadas.";
      return;
    }

    contenedor.innerHTML = tareas.map((tarea) => `
      <article class="resultado-item tarea-item ${tarea.estado === "completada" ? "completada" : ""}">
        <strong>${escaparHTML(tarea.titulo || "Tarea")}</strong>
        <span>${escaparHTML(tarea.fechaLimite ? `Limite: ${tarea.fechaLimite}` : "Sin fecha limite")}</span>
        ${tarea.indicaciones ? `<p>${escaparHTML(tarea.indicaciones)}</p>` : ""}
        <button type="button" data-completar-tarea="${tarea.id}" ${modoVistaPrevia || tarea.estado === "completada" ? "disabled" : ""}>
          ${tarea.estado === "completada" ? "Completada" : "Marcar como completada"}
        </button>
      </article>
    `).join("");

    document.querySelectorAll("[data-completar-tarea]").forEach((boton) => {
      boton.addEventListener("click", () => completarTareaMiSalud(boton.dataset.completarTarea));
    });
  } catch (error) {
    console.error("Error al cargar tareas:", error);
    contenedor.textContent = "No se pudieron cargar las tareas.";
  }
}

async function completarTareaMiSalud(tareaId) {
  if (modoVistaPrevia) return;

  await updateDoc(doc(db, "usuarios", uidSeguimiento, "tareasMiSalud", tareaId), {
    estado: "completada",
    completadaEn: serverTimestamp(),
    completadaFechaISO: new Date().toISOString()
  });

  await cargarTareasMiSalud(uidSeguimiento);
}

const TAREAS_DIARIAS_MI_SALUD = {
  movimiento: "Movimiento",
  medicamento: "Medicamento",
  respiracion: "Respiracion",
  sueno: "Higiene del sueno"
};

function fechaLocalISO(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = `${fecha.getMonth() + 1}`.padStart(2, "0");
  const dia = `${fecha.getDate()}`.padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function formatearFechaCorta(fechaISO = "") {
  const [anio, mes, dia] = String(fechaISO).split("-");
  return anio && mes && dia ? `${dia}-${mes}-${anio}` : fechaISO;
}

function checksTareasDiarias() {
  return [...document.querySelectorAll("[data-tarea-diaria]")];
}

async function cargarTareasDiariasMiSalud(uid) {
  const fecha = fechaLocalISO();
  try {
    const snap = await getDoc(doc(db, "usuarios", uid, "tareasDiariasMiSalud", fecha));
    const completadas = snap.exists() ? snap.data().completadas || {} : {};

    checksTareasDiarias().forEach((check) => {
      check.checked = Boolean(completadas[check.dataset.tareaDiaria]);
      check.disabled = modoVistaPrevia;
    });

    const boton = document.getElementById("guardarTareasDiarias");
    if (boton) boton.disabled = modoVistaPrevia;
  } catch (error) {
    console.error("Error al cargar tareas diarias:", error);
  }
}

async function guardarTareasDiariasMiSalud() {
  if (modoVistaPrevia) {
    alert("La vista previa del medico es de solo lectura.");
    return;
  }

  const fecha = fechaLocalISO();
  const completadas = {};

  checksTareasDiarias().forEach((check) => {
    completadas[check.dataset.tareaDiaria] = check.checked;
  });

  await setDoc(doc(db, "usuarios", uidSeguimiento, "tareasDiariasMiSalud", fecha), {
    fecha,
    completadas,
    total: Object.keys(TAREAS_DIARIAS_MI_SALUD).length,
    completadasTotal: Object.values(completadas).filter(Boolean).length,
    actualizadoEn: serverTimestamp()
  }, { merge: true });

  await cargarCalendarioMiSalud(uidSeguimiento);
  alert("Tareas diarias guardadas.");
}

function fechaRegistroDiario(registro = {}) {
  if (registro.fecha) return registro.fecha;
  if (registro.creadoEn?.toDate) return fechaLocalISO(registro.creadoEn.toDate());
  if (registro.fechaISO) return fechaLocalISO(new Date(registro.fechaISO));
  return "";
}

async function cargarCalendarioMiSalud(uid) {
  const contenedor = document.getElementById("calendarioMiSalud");
  if (!contenedor) return;

  contenedor.textContent = "Cargando calendario...";

  try {
    const [snapTareas, snapRegistros] = await Promise.all([
      getDocs(query(collection(db, "usuarios", uid, "tareasDiariasMiSalud"), orderBy("fecha", "desc"), limit(35))),
      getDocs(query(collection(db, "pacientes", uid, "registrosDiarios"), orderBy("creadoEn", "desc"), limit(35)))
    ]);

    const dias = new Map();

    snapTareas.docs.forEach((docDia) => {
      const datos = docDia.data();
      const fecha = datos.fecha || docDia.id;
      dias.set(fecha, {
        ...(dias.get(fecha) || {}),
        fecha,
        tareas: datos
      });
    });

    snapRegistros.docs.forEach((docRegistro) => {
      const registro = docRegistro.data();
      const fecha = fechaRegistroDiario(registro);
      if (!fecha) return;
      dias.set(fecha, {
        ...(dias.get(fecha) || {}),
        fecha,
        registro
      });
    });

    const ordenados = [...dias.values()]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 21);

    if (!ordenados.length) {
      contenedor.textContent = "Aun no hay datos para mostrar.";
      return;
    }

    contenedor.innerHTML = ordenados.map((dia) => {
      const completadas = dia.tareas?.completadasTotal || 0;
      const total = dia.tareas?.total || Object.keys(TAREAS_DIARIAS_MI_SALUD).length;
      const registro = dia.registro;
      return `
        <article class="dia-mi-salud ${registro ? "con-registro" : ""}">
          <strong>${formatearFechaCorta(dia.fecha)}</strong>
          <span>${completadas}/${total} tareas</span>
          <small>${registro?.animo ? `Animo: ${escaparHTML(registro.animo)}` : "Sin registro diario"}</small>
          ${registro?.ansiedad !== null && registro?.ansiedad !== undefined ? `<small>Ansiedad: ${registro.ansiedad}/10</small>` : ""}
        </article>
      `;
    }).join("");
  } catch (error) {
    console.error("Error al cargar calendario Mi Salud:", error);
    contenedor.textContent = "No se pudo cargar el calendario.";
  }
}

async function cargarTratamiento(uid) {
  const lista = document.getElementById("listaTratamiento");
  if (!lista) return;
  lista.innerHTML = "";

  try {
    const snap = await getDocs(collection(db, "usuarios", uid, "tratamientos"));
    const medicamentos = snap.docs
      .map((docTratamiento) => ({ id: docTratamiento.id, ...docTratamiento.data() }))
      .filter((tratamiento) => (tratamiento.estado || "activo") === "activo");

    if (!medicamentos.length) {
      lista.innerHTML = "<li>Aun no hay tratamiento registrado.</li>";
      return;
    }

    medicamentos.forEach((med) => {
      const li = document.createElement("li");
      const indicacion = formatearIndicacionTratamiento(med, false);
      li.innerHTML = `<strong>${med.medicamento || "Medicamento"}</strong> - ${indicacion || "Sin indicacion completa"}`;
      lista.appendChild(li);
    });
  } catch (error) {
    console.error("Error al cargar tratamiento:", error);
    lista.innerHTML = "<li>Aun no hay tratamiento registrado.</li>";
  }
}

function limpiarPuntoFinal(texto = "") {
  return String(texto).trim().replace(/[.\s]+$/, "");
}

function asegurarPunto(texto = "") {
  const limpio = String(texto).trim();
  if (!limpio) return "";
  return /[.!?]$/.test(limpio) ? limpio : `${limpio}.`;
}

function formatearHorariosTratamiento(horarios = "") {
  const limpio = String(horarios).trim();
  if (!limpio) return "";

  if (/^(a\s+las|alrededor\s+de|por\s+la|en\s+la)/i.test(limpio)) {
    return limpio;
  }

  const multiples = limpio
    .split(/[,;]/)
    .map((h) => h.trim())
    .filter(Boolean);

  if (multiples.length > 1) {
    return `a las ${multiples.join(", ")}`;
  }

  return `a las ${limpio}`;
}

function formatearIndicacionTratamiento(t = {}, incluirMedicamento = true) {
  const medicamento = incluirMedicamento ? asegurarPunto(t.medicamento || "") : "";
  const via = limpiarPuntoFinal(t.via || "");
  const frecuencia = limpiarPuntoFinal(t.frecuencia || "");
  const dosis = limpiarPuntoFinal(t.dosis || "");
  const horarios = formatearHorariosTratamiento(t.horarios || "");

  const tomar = [via, frecuencia].filter(Boolean).join(" ");
  const partes = [];

  if (medicamento) partes.push(medicamento);
  if (tomar) partes.push(asegurarPunto(`Tomar ${tomar}`));
  if (dosis || horarios) partes.push(asegurarPunto([dosis, horarios].filter(Boolean).join(" ")));

  if (!partes.length && !incluirMedicamento) {
    return [t.dosis, t.frecuencia, t.via, t.horarios].filter(Boolean).join(" Â· ");
  }

  return partes.join(" ");
}

async function cargarMetas(uid) {
  const lista = document.getElementById("listaMetas");
  if (!lista) return;
  lista.innerHTML = "";

  try {
    const snapMetas = await getDocs(collection(db, "usuarios", uid, "metasTerapeuticas"));
    const metas = snapMetas.docs
      .map((docMeta) => docMeta.data().texto || docMeta.data().meta)
      .filter(Boolean);

    if (!metas.length) {
      const snapLegacy = await getDoc(doc(db, "pacientes", uid, "miSalud", "metas"));
      const metasLegacy = snapLegacy.exists() ? snapLegacy.data().metas || [] : [];

      if (!metasLegacy.length) {
        lista.innerHTML = "<li>Aun no tienes metas asignadas.</li>";
        return;
      }

      metasLegacy.forEach((meta) => agregarItem(lista, meta));
      return;
    }

    metas.forEach((meta) => agregarItem(lista, meta));
  } catch (error) {
    console.error("Error al cargar metas:", error);
    lista.innerHTML = "<li>Aun no tienes metas asignadas.</li>";
  }
}

async function cargarProximaCita(uid, datosUsuario) {
  try {
    const snapLegacy = await getDoc(doc(db, "pacientes", uid, "miSalud", "agenda"));
    if (snapLegacy.exists() && snapLegacy.data().proximaCita) {
      ponerTexto("proximaCita", snapLegacy.data().proximaCita);
      return;
    }

    const medicoUid =
      datosUsuario.medicoTratanteUid ||
      datosUsuario.medicoTratanteUID ||
      datosUsuario.creadoPor;

    if (!medicoUid) {
      ponerTexto("proximaCita", "No hay proxima cita registrada.");
      return;
    }

    const snapAgenda = await getDocs(collection(db, "usuarios", medicoUid, "agenda"));
    const hoy = new Date().toISOString().slice(0, 10);
    const citas = snapAgenda.docs
      .map((docCita) => docCita.data())
      .filter((cita) => cita.pacienteId === uid && (cita.fecha || "") >= hoy && cita.estado !== "atendida")
      .sort((a, b) => `${a.fecha || ""} ${a.hora || ""}`.localeCompare(`${b.fecha || ""} ${b.hora || ""}`));

    if (!citas.length) {
      ponerTexto("proximaCita", "No hay proxima cita registrada.");
      return;
    }

    const cita = citas[0];
    ponerTexto("proximaCita", `${cita.fecha || ""} ${cita.hora || ""} Â· ${cita.tipo || "Consulta"}`);
  } catch (error) {
    console.error("Error al cargar proxima cita:", error);
    ponerTexto("proximaCita", "No hay proxima cita registrada.");
  }
}

async function cargarResultadosEscalas(uid) {
  const contenedor = document.getElementById("resultadosEscalasPaciente");
  if (!contenedor) return;

  try {
    const escalas = await listarEscalasAplicadas(uid, 8);

    ponerTexto("totalEscalas", String(escalas.length));

    if (!escalas.length) {
      contenedor.textContent = "Sin resultados registrados.";
      return;
    }

    contenedor.innerHTML = escalas.map((r) => `
      <div class="resultado-item">
        <strong>${r.nombreEscala || "Escala"}: ${r.puntajeTotal} / ${r.rango || ""}</strong>
        <span>${r.interpretacion || ""} - ${formatearFechaEscala(r.fechaAplicacion)}</span>
      </div>
    `).join("");
  } catch (error) {
    console.error("Error al cargar resultados:", error);
    contenedor.textContent = "No se pudieron cargar los resultados.";
  }
}

async function cargarUltimoRegistro(uid) {
  try {
    const q = query(
      collection(db, "pacientes", uid, "registrosDiarios"),
      orderBy("creadoEn", "desc"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    const registro = snap.docs[0].data();
    ponerTexto("animoReciente", registro.animo || "--");
    ponerTexto("ansiedadReciente", registro.ansiedad !== null && registro.ansiedad !== undefined ? `${registro.ansiedad}/10` : "--");
    ponerTexto("suenoReciente", registro.sueno !== null && registro.sueno !== undefined ? `${registro.sueno} h` : "--");
  } catch (error) {
    console.error("Error al cargar ultimo registro:", error);
  }
}

async function guardarRegistroDiario() {
  if (modoVistaPrevia) {
    alert("La vista previa del medico es de solo lectura.");
    return;
  }

  const animo = obtenerValor("animo");
  const ansiedad = obtenerValor("ansiedad");
  const sueno = obtenerValor("sueno");
  const energia = obtenerValor("energia");
  const comentario = obtenerValor("comentario").trim();

  if (!animo && !ansiedad && !sueno && !energia && !comentario) {
    alert("Agrega al menos un dato para guardar tu registro.");
    return;
  }

  try {
    await addDoc(collection(db, "pacientes", uidSeguimiento, "registrosDiarios"), {
      animo,
      ansiedad: ansiedad ? Number(ansiedad) : null,
      sueno: sueno ? Number(sueno) : null,
      energia: energia ? Number(energia) : null,
      comentario,
      creadoEn: serverTimestamp()
    });

    const datosUsuario = await obtenerUsuario(usuarioActual.uid);
    const datosPaciente = await obtenerUsuario(uidSeguimiento);

    await registrarEventoAuditoria({
      accion: "guardar_registro_diario",
      modulo: "Mi Salud",
      descripcion: "El usuario guardo un registro diario de seguimiento.",
      usuarioUid: usuarioActual.uid,
      usuarioNombre: datosUsuario?.nombre || usuarioActual.email || "",
      usuarioRol: datosUsuario?.rol || "",
      pacienteUid: uidSeguimiento,
      pacienteNombre: datosPaciente?.nombre || "",
      exito: true,
      detalles: {
        animo,
        ansiedad: ansiedad ? Number(ansiedad) : null,
        sueno: sueno ? Number(sueno) : null,
        energia: energia ? Number(energia) : null,
        tieneComentario: Boolean(comentario)
      }
    });

    alert("Registro guardado correctamente.");
    limpiarCampo("animo");
    limpiarCampo("ansiedad");
    limpiarCampo("sueno");
    limpiarCampo("energia");
    limpiarCampo("comentario");
    await cargarUltimoRegistro(uidSeguimiento);
    await cargarCalendarioMiSalud(uidSeguimiento);
  } catch (error) {
    console.error("Error al guardar registro:", error);
    alert("No se pudo guardar el registro.");
  }
}

async function guardarDiarioPersonal() {
  if (modoVistaPrevia) {
    alert("La vista previa del medico es de solo lectura.");
    return;
  }

  const texto = obtenerValor("diarioTexto").trim();
  const visibleMedico = document.getElementById("diarioVisibleMedico")?.checked === true;

  if (!texto) {
    alert("Escribe una entrada para tu diario.");
    return;
  }

  try {
    await addDoc(collection(db, "usuarios", uidSeguimiento, "diarioPersonal"), {
      texto,
      visibleMedico,
      creadoPor: usuarioActual.uid,
      creadoEn: serverTimestamp(),
      fechaISO: new Date().toISOString()
    });

    const datosUsuario = await obtenerUsuario(usuarioActual.uid);
    await registrarEventoAuditoria({
      accion: "guardar_diario_personal",
      modulo: "Mi Salud",
      descripcion: visibleMedico
        ? "El paciente guardo una entrada de diario visible para su medico."
        : "El paciente guardo una entrada privada de diario.",
      usuarioUid: usuarioActual.uid,
      usuarioNombre: datosUsuario?.nombre || usuarioActual.email || "",
      usuarioRol: datosUsuario?.rol || "",
      pacienteUid: uidSeguimiento,
      pacienteNombre: datosUsuario?.nombre || "",
      exito: true,
      detalles: {
        visibleMedico,
        longitudTexto: texto.length
      }
    });

    limpiarCampo("diarioTexto");
    const privacidad = document.getElementById("diarioVisibleMedico");
    if (privacidad) privacidad.checked = false;
    await cargarDiarioPersonal(uidSeguimiento);
  } catch (error) {
    console.error("Error al guardar diario:", error);
    alert("No se pudo guardar la entrada del diario.");
  }
}

async function cargarDiarioPersonal(uid) {
  const contenedor = document.getElementById("listaDiarioPersonal");
  if (!contenedor) return;

  try {
    const q = query(
      collection(db, "usuarios", uid, "diarioPersonal"),
      orderBy("fechaISO", "desc"),
      limit(12)
    );
    const snap = await getDocs(q);
    const entradas = snap.docs
      .map((docEntrada) => ({ id: docEntrada.id, ...docEntrada.data() }))
      .filter((entrada) => !modoVistaPrevia || entrada.visibleMedico === true);

    if (!entradas.length) {
      contenedor.textContent = modoVistaPrevia
        ? "No hay entradas compartidas con el medico."
        : "Sin entradas registradas.";
      return;
    }

    contenedor.innerHTML = entradas.map((entrada) => {
      const fecha = entrada.fechaISO ? new Date(entrada.fechaISO).toLocaleString("es-MX") : "Sin fecha";
      return `
        <article class="resultado-item diario-item">
          <strong>${escaparHTML(fecha)}</strong>
          <span>${entrada.visibleMedico ? "Visible para tu medico" : "Privado"}</span>
          <p>${escaparHTML(entrada.texto || "")}</p>
        </article>
      `;
    }).join("");
  } catch (error) {
    console.error("Error al cargar diario:", error);
    contenedor.textContent = "No se pudo cargar el diario.";
  }
}

function agregarItem(lista, texto) {
  const li = document.createElement("li");
  li.textContent = texto;
  lista.appendChild(li);
}

function ponerTexto(id, texto) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = texto;
}

function obtenerValor(id) {
  const elemento = document.getElementById(id);
  return elemento ? elemento.value : "";
}

function limpiarCampo(id) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.value = "";
}

function escaparHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

