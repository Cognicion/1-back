import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "TU_APIKEY",
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

    try{

        const cred = await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        await setDoc(
            doc(db,"usuarios",cred.user.uid),
            {
                nombre:nombre,
                email:email,
                rol:"paciente",
                fechaRegistro:new Date().toISOString()
            }
        );

        alert("Usuario creado correctamente");

        window.location.href="dashboard.html";

    }catch(error){

        alert(error.message);

    }

}

window.iniciarSesion = async function(){

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try{

        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        window.location.href="dashboard.html";

    }catch(error){

        alert(error.message);

    }

}
