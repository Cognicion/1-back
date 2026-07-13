const fases = [
  {
    clave: "inhala",
    nombre: "INHALA",
    duracion: 4,
    instruccion: "Deja que el aire entre lentamente."
  },
  {
    clave: "sosten",
    nombre: "SOSTÉN",
    duracion: 2,
    instruccion: "Permanece en quietud."
  },
  {
    clave: "exhala",
    nombre: "EXHALA",
    duracion: 6,
    instruccion: "Suelta el aire sin prisa."
  },
  {
    clave: "descansa",
    nombre: "DESCANSA",
    duracion: 2,
    instruccion: "Permite que todo se asiente."
  }
];

const duracionCiclo = fases.reduce((total, fase) => total + fase.duracion, 0);

const particulas = document.getElementById("particulasRespiracion");
const circulo = document.getElementById("circuloRespiracion");
const pelota = document.getElementById("pelotaRespiracion");
const estela = document.getElementById("estelaRespiracion");
const faseActual = document.getElementById("faseActual");
const instruccionFase = document.getElementById("instruccionFase");
const tiempoRestante = document.getElementById("tiempoRestante");
const ciclosCompletados = document.getElementById("ciclosCompletados");
const estadoSonido = document.getElementById("estadoSonido");
const btnIniciar = document.getElementById("btnIniciar");
const btnPausar = document.getElementById("btnPausar");
const btnReiniciar = document.getElementById("btnReiniciar");
const btnSonido = document.getElementById("btnSonido");
const btnAmbiente = document.getElementById("btnAmbiente");
const controlVolumen = document.getElementById("controlVolumen");

const audios = {
  inhala: new Audio("assets/audio/inhala.mp3"),
  exhala: new Audio("assets/audio/exhala.mp3"),
  campana: new Audio("assets/audio/campana.mp3"),
  fin: new Audio("assets/audio/fin.mp3"),
  ambiente: new Audio("assets/audio/ambiente.mp3")
};

audios.ambiente.loop = true;

let corriendo = false;
let sonidoActivo = false;
let ambienteActivo = false;
let inicioMs = 0;
let acumuladoPausaMs = 0;
let animacionId = null;
let faseAnterior = -1;
let ciclos = 0;
let volumen = Number(controlVolumen?.value || 0.55);
let temporizadorExhala = null;
let temporizadorInhala = null;
let sesionIniciada = false;

function crearParticulas() {
  if (!particulas) return;

  const total = 34;
  const fragmento = document.createDocumentFragment();

  for (let i = 0; i < total; i += 1) {
    const particula = document.createElement("span");
    particula.className = "particula";
    particula.style.left = `${Math.random() * 100}%`;
    particula.style.top = `${Math.random() * 100}%`;
    particula.style.setProperty("--tamano", `${1.5 + Math.random() * 2.8}px`);
    particula.style.setProperty("--duracion", `${24 + Math.random() * 34}s`);
    particula.style.setProperty("--retraso", `${Math.random() * -38}s`);
    particula.style.setProperty("--x", `${-34 + Math.random() * 68}px`);
    particula.style.setProperty("--y", `${-80 - Math.random() * 180}px`);
    particula.style.setProperty("--opacidad", `${0.18 + Math.random() * 0.34}`);
    fragmento.appendChild(particula);
  }

  particulas.appendChild(fragmento);
}

function obtenerEstado(tiempoSegundos) {
  const cicloActual = Math.floor(tiempoSegundos / duracionCiclo);
  const posicion = tiempoSegundos % duracionCiclo;
  let acumulado = 0;

  for (let i = 0; i < fases.length; i += 1) {
    const fase = fases[i];
    const fin = acumulado + fase.duracion;

    if (posicion < fin) {
      return {
        indiceFase: i,
        fase,
        cicloActual,
        posicion,
        restante: Math.ceil(fin - posicion)
      };
    }

    acumulado = fin;
  }

  return {
    indiceFase: 0,
    fase: fases[0],
    cicloActual,
    posicion: 0,
    restante: fases[0].duracion
  };
}

function moverOrbita(posicionCiclo) {
  const progreso = posicionCiclo / duracionCiclo;
  const angulo = -90 + progreso * 360;
  const estelaAngulo = angulo - 7;

  pelota.style.transform = `translate(-50%, -50%) rotate(${angulo}deg) translateX(calc(var(--radio) - 1px))`;
  estela.style.transform = `translate(-50%, -50%) rotate(${estelaAngulo}deg) translateX(calc(var(--radio) - 18px))`;
}

function cambiarTexto(elemento, texto) {
  if (!elemento || elemento.textContent === texto) return;

  elemento.classList.add("cambiando");
  window.setTimeout(() => {
    elemento.textContent = texto;
    elemento.classList.remove("cambiando");
  }, 260);
}

function aplicarFase(estado) {
  const clase = `fase-${estado.fase.clave}`;
  circulo.classList.remove("fase-inhala", "fase-sosten", "fase-exhala", "fase-descansa");
  circulo.classList.add(clase);

  cambiarTexto(faseActual, estado.fase.nombre);
  cambiarTexto(instruccionFase, estado.fase.instruccion);
}

function renderizar(timestamp) {
  if (!corriendo) return;

  const transcurridoMs = acumuladoPausaMs + (timestamp - inicioMs);
  const transcurridoSeg = transcurridoMs / 1000;
  const estado = obtenerEstado(transcurridoSeg);

  tiempoRestante.textContent = String(estado.restante);
  moverOrbita(estado.posicion);

  if (estado.cicloActual !== ciclos) {
    ciclos = estado.cicloActual;
    ciclosCompletados.textContent = String(ciclos);
  }

  if (estado.indiceFase !== faseAnterior) {
    const terminoCiclo = faseAnterior === 3 && estado.indiceFase === 0;

    faseAnterior = estado.indiceFase;
    aplicarFase(estado);
    reproducirAudioDeFase(estado.fase.clave, terminoCiclo);
  }

  animacionId = requestAnimationFrame(renderizar);
}

function iniciar() {
  if (corriendo) return;

  corriendo = true;
  sesionIniciada = true;
  inicioMs = performance.now();
  animacionId = requestAnimationFrame(renderizar);
}

function pausar() {
  if (!corriendo) return;

  corriendo = false;
  acumuladoPausaMs += performance.now() - inicioMs;
  if (animacionId) cancelAnimationFrame(animacionId);
  pausarAudiosDeFase();
}

function reiniciar() {
  corriendo = false;
  if (animacionId) cancelAnimationFrame(animacionId);
  if (temporizadorExhala) window.clearTimeout(temporizadorExhala);
  if (temporizadorInhala) window.clearTimeout(temporizadorInhala);

  inicioMs = 0;
  acumuladoPausaMs = 0;
  faseAnterior = -1;
  ciclos = 0;

  pausarAudiosDeFase();
  aplicarFase({ fase: fases[0] });
  tiempoRestante.textContent = String(fases[0].duracion);
  ciclosCompletados.textContent = "0";
  moverOrbita(0);
}

function establecerVolumen(nuevoVolumen) {
  volumen = Number(nuevoVolumen);
  Object.values(audios).forEach((audio) => {
    audio.volume = volumen;
  });
}

function alternarSonido() {
  sonidoActivo = !sonidoActivo;
  estadoSonido.textContent = sonidoActivo ? "Encendido" : "Apagado";
  btnSonido.textContent = sonidoActivo ? "Sonido on" : "Sonido off";

  if (!sonidoActivo) {
    pausarAudiosDeFase();
  }
}

function alternarAmbiente() {
  if (!sesionIniciada) {
    btnAmbiente.textContent = "Inicia primero";
    window.setTimeout(() => {
      btnAmbiente.textContent = ambienteActivo ? "Ambiente on" : "Ambiente off";
    }, 1200);
    return;
  }

  ambienteActivo = !ambienteActivo;
  btnAmbiente.textContent = ambienteActivo ? "Ambiente on" : "Ambiente off";

  if (!ambienteActivo) {
    audios.ambiente.pause();
    return;
  }

  audios.ambiente.currentTime = 0;
  audios.ambiente.play().catch(() => {
    ambienteActivo = false;
    btnAmbiente.textContent = "Ambiente off";
  });
}

function reproducirAudioDeFase(clave, terminoCiclo = false) {
  if (!sonidoActivo) return;

  if (temporizadorExhala) {
    window.clearTimeout(temporizadorExhala);
    temporizadorExhala = null;
  }

  if (temporizadorInhala) {
    window.clearTimeout(temporizadorInhala);
    temporizadorInhala = null;
  }

  pausarAudiosDeFase();

  if (clave === "inhala") {
    if (terminoCiclo) {
      reproducir("fin");
      temporizadorInhala = window.setTimeout(() => reproducir("inhala"), 450);
    } else {
      reproducir("inhala");
    }
  }

  if (clave === "exhala") {
    reproducir("campana");
    temporizadorExhala = window.setTimeout(() => reproducir("exhala"), 300);
  }
}

function reproducir(nombre) {
  if (!sonidoActivo && nombre !== "ambiente") return;

  const audio = audios[nombre];
  if (!audio) return;

  audio.volume = volumen;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Los archivos pueden no existir todavia; la experiencia visual sigue funcionando.
  });
}

function pausarAudiosDeFase() {
  ["inhala", "exhala", "campana", "fin"].forEach((nombre) => {
    const audio = audios[nombre];
    audio.pause();
    audio.currentTime = 0;
  });
}

btnIniciar?.addEventListener("click", iniciar);
btnPausar?.addEventListener("click", pausar);
btnReiniciar?.addEventListener("click", reiniciar);
btnSonido?.addEventListener("click", alternarSonido);
btnAmbiente?.addEventListener("click", alternarAmbiente);
controlVolumen?.addEventListener("input", (evento) => establecerVolumen(evento.target.value));

crearParticulas();
establecerVolumen(volumen);
reiniciar();
