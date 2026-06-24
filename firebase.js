import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC9eSx4-5wvNebk2pXFT8dcuRbJqJe9Qp4",
  authDomain: "cognicion-57052.firebaseapp.com",
  projectId: "cognicion-57052",
  storageBucket: "cognicion-57052.firebasestorage.app",
  messagingSenderId: "1037684177162",
  appId: "1:1037684177162:web:537b09233b83f3e9b422f3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.registrarUsuario = async function() {
  const nombre = document.getElementById("nombre").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "usuarios", cred.user.uid), {
      nombre: nombre,
      email: email,
      rol: "paciente",
      fechaRegistro: new Date().toISOString()
    });

    alert("Usuario creado correctamente");
    window.location.href = "dashboard.html";

  } catch(error) {
    alert(error.message);
  }
};

window.iniciarSesion = async function() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";

  } catch(error) {
    alert(error.message);
  }
};

window.cerrarSesion = async function() {
  await signOut(auth);
  window.location.href = "login.html";
};

window.guardarNotaMedica = async function() {
  const uidPaciente = document.getElementById("uidPaciente").value;

  if (!uidPaciente) {
    alert("Selecciona un paciente");
    return;
  }

  const diagnostico = document.getElementById("diagnostico").value;
  const tratamiento = document.getElementById("tratamiento").value;
  const medico = document.getElementById("medico").value;
  const ultimaConsulta = document.getElementById("ultimaConsulta").value;

  const subjetivo = document.getElementById("subjetivo").value;
  const objetivo = document.getElementById("objetivo").value;
  const analisis = document.getElementById("analisis").value;
  const plan = document.getElementById("plan").value;

  try {
    await updateDoc(doc(db, "usuarios", uidPaciente), {
      diagnostico: diagnostico,
      tratamiento: tratamiento,
      medicoTratante: medico,
      ultimaConsulta: ultimaConsulta
    });

    await addDoc(collection(db, "usuarios", uidPaciente, "notasMedicas"), {
      fecha: new Date().toISOString(),
      autor: medico,
      subjetivo: subjetivo,
      objetivo: objetivo,
      analisis: analisis,
      plan: plan
    });

    alert("Nota médica guardada correctamente");

    cargarHistorial(uidPaciente);
    
  } catch(error) {
    alert("Error: " + error.message);
  }
};

onAuthStateChanged(auth, async (user) => {

  if (window.location.pathname.includes("dashboard.html")) {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const refUsuario = doc(db, "usuarios", user.uid);
    const snap = await getDoc(refUsuario);

    if (snap.exists()) {
      document.getElementById("bienvenida").innerText =
        "Bienvenido, " + snap.data().nombre;
    } else {
      document.getElementById("bienvenida").innerText = "Bienvenido";
    }
  }

  if (window.location.pathname.includes("medico.html")) {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const refUsuario = doc(db, "usuarios", user.uid);
    const snap = await getDoc(refUsuario);

    if (!snap.exists()) {
      window.location.href = "login.html";
      return;
    }

    const datos = snap.data();

    if (datos.rol !== "medico") {
      alert("Acceso restringido al personal médico");
      window.location.href = "dashboard.html";
      return;
    }

    const selector = document.getElementById("uidPaciente");

    const q = query(
      collection(db, "usuarios"),
      where("rol", "==", "paciente")
    );

    const pacientes = await getDocs(q);

    pacientes.forEach((paciente) => {
      const datosPaciente = paciente.data();
      const opcion = document.createElement("option");

      opcion.value = paciente.id;
      opcion.textContent = datosPaciente.nombre;

      selector.appendChild(opcion);
    });
    selector.addEventListener("change", () => {
  cargarHistorial(selector.value);
});
  }

  if (window.location.pathname.includes("expediente.html")) {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const refUsuario = doc(db, "usuarios", user.uid);
    const snap = await getDoc(refUsuario);

    if (snap.exists()) {
      const datos = snap.data();

      document.getElementById("nombre").innerText =
        datos.nombre || "Sin nombre registrado";

      document.getElementById("diagnostico").innerText =
        datos.diagnostico || "Sin diagnóstico registrado";

      document.getElementById("tratamiento").innerText =
        datos.tratamiento || "Sin tratamiento registrado";

      document.getElementById("medicoTratante").innerText =
        datos.medicoTratante || "Sin médico tratante registrado";

      document.getElementById("ultimaConsulta").innerText =
        datos.ultimaConsulta || "Sin fecha registrada";
    }
  }

});
async function cargarHistorial(uidPaciente){

    const contenedor =
    document.getElementById("historialNotas");

    contenedor.innerHTML = "";

    const q = query(
        collection(
            db,
            "usuarios",
            uidPaciente,
            "notasMedicas"
        ),
        orderBy("fecha","desc")
    );

    const notas = await getDocs(q);

    if(notas.empty){

        contenedor.innerHTML = `
        <p style="color:#999">
        No hay notas registradas
        </p>
        `;

        return;
    }

    notas.forEach((nota)=>{

        const datos = nota.data();

        contenedor.innerHTML += `

        <div style="
        background:#0d0d0d;
        border:1px solid #333;
        border-radius:20px;
        padding:25px;
        margin-bottom:20px;
        ">

        <h3>${datos.fecha.substring(0,10)}</h3>

        <p><b>Médico:</b> ${datos.autor}</p>

        <p><b>Subjetivo:</b><br>
        ${datos.subjetivo}</p>

        <p><b>Objetivo:</b><br>
        ${datos.objetivo}</p>

        <p><b>Análisis:</b><br>
        ${datos.analisis}</p>

        <p><b>Plan:</b><br>
        ${datos.plan}</p>

        </div>

        `;

    });

}
