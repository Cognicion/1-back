import { auth, db } from "./firebase.js";
import { ESCALAS_PSIQUIATRICAS, interpretarEscala } from "./data/escalasPsiquiatricas.js";
import { medicoPuedeVer } from "./services/usuarios.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let usuarioActual = null;
let uidSeguimiento = null;
let modoVistaPrevia = false;

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
    await cargarMiSalud(uidSeguimiento, datosSeguimiento, datos.rol);
    configurarEscalas();
    await cargarResultadosEscalas(uidSeguimiento);
    await cargarUltimoRegistro(uidSeguimiento);

    document.getElementById("guardarRegistro")?.addEventListener("click", guardarRegistroDiario);
    document.getElementById("guardarEscala")?.addEventListener("click", guardarResultadoEscala);
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
    document.getElementById("guardarRegistro")?.setAttribute("disabled", "disabled");
    document.getElementById("guardarEscala")?.setAttribute("disabled", "disabled");
  }
}

function configurarEscalas() {
  const selector = document.getElementById("selectorEscala");
  if (!selector) return;

  selector.innerHTML = ESCALAS_PSIQUIATRICAS
    .map((escala) => `<option value="${escala.id}">${escala.nombre} - ${escala.area}</option>`)
    .join("");

  selector.addEventListener("change", renderizarEscalaSeleccionada);
  renderizarEscalaSeleccionada();
}

function escalaActual() {
  const id = document.getElementById("selectorEscala")?.value;
  return ESCALAS_PSIQUIATRICAS.find((escala) => escala.id === id) || ESCALAS_PSIQUIATRICAS[0];
}

function renderizarEscalaSeleccionada() {
  const escala = escalaActual();
  const descripcion = document.getElementById("descripcionEscala");
  const items = document.getElementById("itemsEscala");
  if (!escala || !descripcion || !items) return;

  descripcion.innerHTML = `
    <strong>${escala.nombre}</strong> - ${escala.area}<br>
    ${escala.descripcion}<br>
    <small>Rango: ${escala.rango}. Esto no sustituye valoracion clinica.</small>
  `;

  items.innerHTML = escala.items.map((item, index) => `
    <div class="item-escala">
      <label>${index + 1}. ${item}
        <select data-item-escala="${index}" ${modoVistaPrevia ? "disabled" : ""}>
          <option value="">Seleccionar</option>
          ${escala.opciones.map((opcion, i) => `<option value="${escala.valores[i]}">${opcion}</option>`).join("")}
        </select>
      </label>
    </div>
  `).join("");
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
    item: escala.items[index],
    valor: select.value === "" ? null : Number(select.value),
    respuesta: select.options[select.selectedIndex]?.textContent || ""
  }));

  if (respuestas.some((r) => r.valor === null)) {
    alert("Responde todos los reactivos de la escala.");
    return;
  }

  const puntaje = respuestas.reduce((total, r) => total + r.valor, 0);
  const interpretacion = interpretarEscala(escala, puntaje);

  await addDoc(collection(db, "usuarios", uidSeguimiento, "resultadosEscalas"), {
    escalaId: escala.id,
    escalaNombre: escala.nombre,
    area: escala.area,
    puntaje,
    rango: escala.rango,
    interpretacion,
    respuestas,
    creadoEn: serverTimestamp(),
    fechaISO: new Date().toISOString()
  });

  alert(`Resultado guardado: ${escala.nombre} = ${puntaje} (${interpretacion})`);
  renderizarEscalaSeleccionada();
  await cargarResultadosEscalas(uidSeguimiento);
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
      const indicacion = [med.dosis, med.frecuencia, med.via].filter(Boolean).join(" · ");
      li.innerHTML = `<strong>${med.medicamento || "Medicamento"}</strong> - ${indicacion || "Sin indicacion completa"}`;
      lista.appendChild(li);
    });
  } catch (error) {
    console.error("Error al cargar tratamiento:", error);
    lista.innerHTML = "<li>Aun no hay tratamiento registrado.</li>";
  }
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
    ponerTexto("proximaCita", `${cita.fecha || ""} ${cita.hora || ""} · ${cita.tipo || "Consulta"}`);
  } catch (error) {
    console.error("Error al cargar proxima cita:", error);
    ponerTexto("proximaCita", "No hay proxima cita registrada.");
  }
}

async function cargarResultadosEscalas(uid) {
  const contenedor = document.getElementById("resultadosEscalasPaciente");
  if (!contenedor) return;

  try {
    const q = query(
      collection(db, "usuarios", uid, "resultadosEscalas"),
      orderBy("fechaISO", "desc"),
      limit(8)
    );
    const snap = await getDocs(q);

    ponerTexto("totalEscalas", String(snap.size));

    if (snap.empty) {
      contenedor.textContent = "Sin resultados registrados.";
      return;
    }

    contenedor.innerHTML = snap.docs.map((docResultado) => {
      const r = docResultado.data();
      const fecha = r.fechaISO ? new Date(r.fechaISO).toLocaleDateString("es-MX") : "";
      return `
        <div class="resultado-item">
          <strong>${r.escalaNombre || "Escala"}: ${r.puntaje} / ${r.rango || ""}</strong>
          <span>${r.interpretacion || ""} · ${fecha}</span>
        </div>
      `;
    }).join("");
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

    alert("Registro guardado correctamente.");
    limpiarCampo("animo");
    limpiarCampo("ansiedad");
    limpiarCampo("sueno");
    limpiarCampo("energia");
    limpiarCampo("comentario");
    await cargarUltimoRegistro(uidSeguimiento);
  } catch (error) {
    console.error("Error al guardar registro:", error);
    alert("No se pudo guardar el registro.");
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
