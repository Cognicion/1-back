export const REGISTRO_FARMACOS_NEURO = [
  { id: "litio", nombre: "Litio", clase: "Modulador intracelular", diana: "segundos mensajeros", inicio: "lento", descripcion: "Modelo simplificado de modulacion intracelular. El mecanismo clinico del litio no se reduce a un unico canal.", efectos: { modulacionLenta: 0.32, excitabilidad: -0.14, liberacion: -0.08 } },
  { id: "valproato", nombre: "Valproato", clase: "Perfil multimodal", diana: "Na+, GABA y liberacion excitadora", inicio: "intermedio", descripcion: "Aproximacion educativa multimodal: reduce excitabilidad repetitiva, modula Na+ y favorece tono inhibitorio.", efectos: { bloqueoNa: 0.18, gaba: 0.18, liberacion: -0.12, umbral: 3 } },
  { id: "fenitoina", nombre: "Fenitoina", clase: "Bloqueador de Na+ dependiente de uso", diana: "canales de Na+ inactivados", inicio: "rapido", descripcion: "El bloqueo aumenta durante actividad repetitiva y reduce descargas de alta frecuencia.", efectos: { bloqueoNaUso: 0.46, recuperacionNa: -0.18 } },
  { id: "carbamazepina", nombre: "Carbamazepina", clase: "Estabilizador de Na+", diana: "canales de Na+", inicio: "rapido", descripcion: "Estabilizacion educativa del estado inactivado de canales de Na+.", efectos: { bloqueoNaUso: 0.34, recuperacionNa: -0.12 } },
  { id: "lamotrigina", nombre: "Lamotrigina", clase: "Estabilizador de Na+", diana: "Na+ y liberacion glutamatergica", inicio: "intermedio", descripcion: "Reduce excitabilidad repetitiva y liberacion excitadora dentro del modelo.", efectos: { bloqueoNaUso: 0.28, liberacion: -0.14 } },
  { id: "benzodiacepina", nombre: "Benzodiacepina", clase: "Modulador alosterico GABA-A", diana: "receptor GABA-A", inicio: "rapido", descripcion: "Potencia GABA-A solo cuando hay GABA presente; no abre el canal de forma independiente en este modelo.", efectos: { gaba: 0.45 } },
  { id: "diazepam", nombre: "Diazepam", clase: "Benzodiacepina", diana: "GABA-A", inicio: "rapido", descripcion: "Potenciacion alosterica educativa del receptor GABA-A.", efectos: { gaba: 0.5 } },
  { id: "clonazepam", nombre: "Clonazepam", clase: "Benzodiacepina", diana: "GABA-A", inicio: "rapido", descripcion: "Potenciacion GABAergica con efecto sostenido representado de forma simplificada.", efectos: { gaba: 0.52 } },
  { id: "lorazepam", nombre: "Lorazepam", clase: "Benzodiacepina", diana: "GABA-A", inicio: "rapido", descripcion: "Aumenta la respuesta GABA-A dependiente de GABA.", efectos: { gaba: 0.46 } },
  { id: "barbiturico", nombre: "Barbiturico", clase: "Modulador GABA-A", diana: "GABA-A", inicio: "rapido", descripcion: "Prolonga la apertura GABA-A y produce mayor depresion educativa que benzodiacepina.", efectos: { gaba: 0.72, excitabilidad: -0.18 } },
  { id: "levetiracetam", nombre: "Levetiracetam", clase: "Modulador SV2A", diana: "vesiculas presinapticas", inicio: "intermedio", descripcion: "Disminuye liberacion vesicular excesiva sin bloquear la transmision basal.", efectos: { sv2a: 0.36, liberacionAltaFrecuencia: -0.28 } },
  { id: "gabapentina", nombre: "Gabapentina", clase: "Modulador alfa2delta", diana: "canales de Ca2+ presinapticos", inicio: "intermedio", descripcion: "Reduce entrada presinaptica de Ca2+ y liberacion excitadora durante estimulacion.", efectos: { bloqueoCa: 0.34, liberacion: -0.22 } },
  { id: "pregabalina", nombre: "Pregabalina", clase: "Modulador alfa2delta", diana: "canales de Ca2+ presinapticos", inicio: "intermedio", descripcion: "Disminuye Ca2+ presinaptico y probabilidad de liberacion en este modelo.", efectos: { bloqueoCa: 0.42, liberacion: -0.26 } },
  { id: "topiramato", nombre: "Topiramato", clase: "Multimodal", diana: "Na+, GABA-A y AMPA", inicio: "intermedio", descripcion: "Perfil educativo multimodal: reduce Na+, potencia GABA y reduce AMPA.", efectos: { bloqueoNa: 0.18, gaba: 0.22, ampa: -0.22 } },
  { id: "bloqueador_na", nombre: "Bloqueador experimental Na+", clase: "Herramienta experimental", diana: "canales de Na+", inicio: "rapido", descripcion: "Reduce conductancia efectiva de Na+.", efectos: { bloqueoNa: 0.55 } },
  { id: "bloqueador_k", nombre: "Bloqueador experimental K+", clase: "Herramienta experimental", diana: "canales de K+", inicio: "rapido", descripcion: "Reduce salida de K+ y retrasa repolarizacion.", efectos: { bloqueoK: 0.48 } },
  { id: "bloqueador_ca", nombre: "Bloqueador experimental Ca2+", clase: "Herramienta experimental", diana: "canales de Ca2+", inicio: "rapido", descripcion: "Reduce entrada de Ca2+ presinaptico y liberacion vesicular.", efectos: { bloqueoCa: 0.62 } },
  { id: "antagonista_gabaa", nombre: "Antagonista GABA-A", clase: "Antagonista", diana: "GABA-A", inicio: "rapido", descripcion: "Reduce la respuesta inhibitoria GABA-A.", efectos: { gaba: -0.72 } },
  { id: "antagonista_ampa", nombre: "Antagonista AMPA", clase: "Antagonista", diana: "AMPA", inicio: "rapido", descripcion: "Reduce respuesta glutamatergica rapida.", efectos: { ampa: -0.68 } },
  { id: "antagonista_nmda", nombre: "Antagonista NMDA", clase: "Antagonista", diana: "NMDA", inicio: "rapido", descripcion: "Reduce componente NMDA y entrada postsinaptica de Ca2+.", efectos: { nmda: -0.62 } },
  { id: "agonista_gabaa", nombre: "Agonista GABA-A", clase: "Agonista", diana: "GABA-A", inicio: "rapido", descripcion: "Aumenta la respuesta GABA-A en forma educativa.", efectos: { gaba: 0.86 } },
  { id: "ttx", nombre: "Tetrodotoxina", clase: "Bloqueador Na+", diana: "canales de Na+ voltaje-dependientes", inicio: "rapido", descripcion: "Bloqueo intenso de Na+ con perdida del potencial de accion y propagacion.", efectos: { bloqueoNa: 0.96 } },
  { id: "tea", nombre: "Tetraetilamonio", clase: "Bloqueador K+", diana: "canales de K+", inicio: "rapido", descripcion: "Retrasa repolarizacion y ensancha el potencial de accion.", efectos: { bloqueoK: 0.82 } },
  { id: "cocaina", nombre: "Cocaina", clase: "Droga de abuso", diana: "transportadores monoaminergicos", inicio: "rapido", descripcion: "Modelo educativo: bloqueo de recaptura monoaminergica con aumento de senal sinaptica y excitabilidad.", efectos: { excitabilidad: 0.3, liberacion: 0.18 } },
  { id: "metanfetamina", nombre: "Anfetamina / metanfetamina", clase: "Droga de abuso", diana: "liberacion y transporte monoaminergico", inicio: "rapido", descripcion: "Modelo educativo: favorece liberacion presinaptica y aumenta actividad sinaptica.", efectos: { excitabilidad: 0.38, liberacion: 0.34, umbral: -2 } },
  { id: "alcohol", nombre: "Alcohol", clase: "Droga de abuso", diana: "GABA-A / glutamato", inicio: "rapido", descripcion: "Modelo educativo: potencia inhibicion GABAergica y reduce excitabilidad excitadora.", efectos: { gaba: 0.38, excitabilidad: -0.22, ampa: -0.18 } },
  { id: "opioide", nombre: "Opioide", clase: "Droga de abuso", diana: "receptores opioides presinapticos", inicio: "rapido", descripcion: "Modelo educativo: reduce liberacion presinaptica e hiperpolariza por aumento relativo de salida de K+.", efectos: { liberacion: -0.36, excitabilidad: -0.28, umbral: 2 } },
  { id: "cannabis", nombre: "Cannabis", clase: "Droga de abuso", diana: "CB1 presinaptico", inicio: "intermedio", descripcion: "Modelo educativo: modulacion presinaptica con reduccion de liberacion de neurotransmisor.", efectos: { liberacion: -0.22, excitabilidad: -0.08 } }
];

export function obtenerFarmaco(id) {
  return REGISTRO_FARMACOS_NEURO.find((farmaco) => farmaco.id === id) || null;
}

export function resumirEfectosFarmacos(farmacosActivos = [], tiempo = 0) {
  const resumen = { bloqueoNa: 0, bloqueoK: 0, bloqueoCa: 0, gaba: 0, ampa: 0, nmda: 0, liberacion: 0, sv2a: 0, excitabilidad: 0, umbral: 0, modulacionLenta: 0, usoNa: 0 };
  farmacosActivos.forEach((activo) => {
    const farmaco = obtenerFarmaco(activo.id);
    if (!farmaco) return;
    const intensidad = Math.max(0, Math.min(1, Number(activo.intensidad ?? 0.5)));
    const factorInicio = farmaco.inicio === "lento" ? (1 - Math.exp(-tiempo / 240)) : farmaco.inicio === "intermedio" ? (1 - Math.exp(-tiempo / 80)) : 1;
    const factor = intensidad * factorInicio;
    Object.entries(farmaco.efectos || {}).forEach(([clave, valor]) => {
      if (clave === "bloqueoNaUso" || clave === "recuperacionNa") resumen.usoNa += Math.abs(valor) * factor;
      else if (clave === "liberacionAltaFrecuencia") resumen.liberacion += valor * factor;
      else resumen[clave] = (resumen[clave] || 0) + valor * factor;
    });
  });
  ["bloqueoNa", "bloqueoK", "bloqueoCa", "sv2a", "usoNa"].forEach((k) => { resumen[k] = Math.max(0, Math.min(0.98, resumen[k])); });
  return resumen;
}
