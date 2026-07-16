import { auth } from "../firebase.js";
import { inicializarAccesosRapidos } from "../js/components/accesosRapidos.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const navbar = document.getElementById("navbar");

onAuthStateChanged(auth, (user) => {

    navbar.innerHTML = `

    <nav class="navbar-medico">

        <div class="logo">

            Cognición

        </div>

        <div class="menu">

            <a href="dashboard.html">
                🏠 Inicio
            </a>

            <a href="medico.html">
                👨‍⚕️ Panel médico
            </a>

            <div data-accesos-rapidos></div>

            <button id="btnVolver">

                ← Regresar

            </button>

            <button id="btnSalir">

                Cerrar sesión

            </button>

        </div>

    </nav>

    `;

    inicializarAccesosRapidos(navbar);

    document
        .getElementById("btnVolver")
        .onclick = () => history.back();

    document
        .getElementById("btnSalir")
        .onclick = async () => {

            await signOut(auth);

            location.href = "login.html";

        };

});
