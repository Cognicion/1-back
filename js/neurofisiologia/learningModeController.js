export const UI_MODE_NEURO_BASE = {
  learningLevel: "basico",
  tutorialActive: false,
  tutorialStep: 0,
  explanationMode: false,
  particleDensity: "baja",
  particleSpeed: "lenta",
  reducedMotion: false,
  mathView: "resumida",
  cameraMode: "membrana",
  ionFilter: "todos",
  showCharges: true,
  focusedStructure: "reposo"
};

export const PASOS_TUTORIAL_NEURO = [
  { titulo: "Esta es la neurona integrada", foco: "escenaIntegrada", texto: "Todos los procesos ocurren en el mismo modelo. El estimulo comienza en el soma, viaja por el axon y llega a la sinapsis." },
  { titulo: "Potencial de membrana", foco: "tarjetaEstadoActual", texto: "El potencial de membrana indica la diferencia de carga electrica entre el interior y el exterior de la neurona." },
  { titulo: "Aplicar estimulo", foco: "btnIntegradaPulso", texto: "Presiona aqui para intentar generar un potencial de accion." },
  { titulo: "Entrada de sodio", foco: "escenaIntegrada", texto: "Cuando se alcanza el umbral, se abren canales de sodio y el Na+ entra. Esto despolariza la membrana." },
  { titulo: "Salida de potasio", foco: "escenaIntegrada", texto: "Despues se abren canales de potasio. El K+ sale y la membrana se repolariza." },
  { titulo: "Propagacion", foco: "escenaIntegrada", texto: "El cambio de voltaje activa segmentos vecinos y el impulso avanza por el axon." },
  { titulo: "Sinapsis", foco: "escenaIntegrada", texto: "La llegada del potencial abre canales de calcio. El Ca2+ favorece la liberacion de neurotransmisor." },
  { titulo: "Grafica", foco: "graficaIntegrada", texto: "La grafica muestra el mismo proceso que observas en la animacion." },
  { titulo: "Formulas", foco: "matematicasIntegradas", texto: "Aqui puedes ver la ecuacion utilizada, sus variables, los valores sustituidos y el resultado." },
  { titulo: "Niveles de aprendizaje", foco: "intNivelAprendizaje", texto: "Comienza en modo basico y cambia a intermedio o avanzado cuando quieras profundizar." }
];

export const GRAFICAS_POR_NIVEL = {
  basico: ["Vm"],
  intermedio: ["Vm", "INa", "IK", "ICa", "NT", "Post"],
  avanzado: ["Vm", "INa", "IK", "ICa", "NT", "Post", "Prelease", "receptor"]
};

export function crearUiModeNeuro() {
  return { ...UI_MODE_NEURO_BASE };
}

export function focoDesdeEstado(estado) {
  if (estado.sinapsis?.nt > 0.08 || estado.sinapsis?.caLocal > 0.28) return "sinapsis";
  if (estado.posicionOnda > 0) return "propagacion";
  if (estado.fase === "Despolarizacion" || estado.canales?.sodio === "Abierto") return "sodio";
  if (estado.fase === "Repolarizacion" || estado.canales?.potasio?.includes("Ab")) return "potasio";
  return "reposo";
}

export function estadoActualEducativo(estado, uiMode = UI_MODE_NEURO_BASE) {
  const foco = focoDesdeEstado(estado);
  const basico = uiMode.learningLevel === "basico";
  const mapa = {
    reposo: { fase: "Reposo", canal: "Canales cerrados / fuga", movimiento: "Iones en equilibrio relativo", consecuencia: "Vm se mantiene estable" },
    sodio: { fase: "Despolarizacion", canal: "Na+ dependiente de voltaje", movimiento: "Na+ entra", consecuencia: "Vm aumenta" },
    potasio: { fase: "Repolarizacion", canal: "K+ dependiente de voltaje", movimiento: "K+ sale", consecuencia: "Vm desciende" },
    propagacion: { fase: "Propagacion", canal: "Nodos axonales", movimiento: "La onda avanza", consecuencia: "La terminal se aproxima a activarse" },
    sinapsis: { fase: "Transmision sinaptica", canal: "Ca2+ presinaptico / receptores", movimiento: "Ca2+ entra y se libera NT", consecuencia: "Cambia el potencial postsinaptico" }
  };
  const info = mapa[foco] || mapa.reposo;
  return {
    ...info,
    foco,
    detalle: basico ? "" : `Ecuacion activa: ${estado.ecuacionActiva}. Vm ${Number(estado.Vm).toFixed(1)} mV.`
  };
}
