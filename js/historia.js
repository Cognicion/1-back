import { auth } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    obtenerUsuario
} from "./services/usuarios.js";

import {
    guardarHistoriaClinica,
    obtenerHistoriaClinica
} from "./services/historias.js";

let uidPaciente = null;

onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const usuario = await obtenerUsuario(user.uid);

    if (!usuario || usuario.rol !== "medico") {
        alert("Acceso restringido");
        window.location.href = "dashboard.html";
        return;
    }

    const parametros = new URLSearchParams(window.location.search);

    uidPaciente = parametros.get("id");

    if (!uidPaciente) return;

    await cargarPaciente();
    await cargarHistoria();

});

async function cargarPaciente(){

    const paciente = await obtenerUsuario(uidPaciente);

    if(!paciente) return;

    document.getElementById("nombrePaciente").textContent =
        paciente.nombre || "Paciente";

    document.getElementById("datosPaciente").textContent =
        `${paciente.edad || ""} años`;
}

async function cargarHistoria(){

    const historia = await obtenerHistoriaClinica(uidPaciente);

    if(!historia.exists()) return;

    const datos = historia.data();

    Object.keys(datos).forEach(campo=>{

        const elemento=document.getElementById(campo);

        if(elemento){

            elemento.value=datos[campo];

        }

    });

}

window.guardarHistoria = async () => {

    if (!uidPaciente) {
        alert("No hay paciente seleccionado. Abre esta historia desde el expediente o desde la lista de pacientes.");
        return;
    }

    const datos = {};

    document
        .querySelectorAll("input, textarea")
        .forEach(campo=>{

            datos[campo.id]=campo.value;

        });

    await guardarHistoriaClinica(uidPaciente,datos);

    alert("Historia clínica guardada.");

}

window.descargarHistoriaPDF=()=>{

    window.print();

}

const tabs = document.querySelectorAll(".tab");
const secciones = document.querySelectorAll(".seccion");

tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("activo"));
        secciones.forEach((s) => s.classList.remove("activa"));

        tab.classList.add("activo");

        const seccion = document.getElementById(tab.dataset.seccion);

        if (seccion) {
            seccion.classList.add("activa");
        }
    });
});