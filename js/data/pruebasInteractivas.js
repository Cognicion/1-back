// Motor declarativo inicial para aplicar pruebas dentro de Cognicion.
// Criterios de interpretacion documentados por instrumento en "referencias".
// Instrumentos con restricciones (p. ej. MoCA/MMSE) usan aplicacion guiada y captura por dominios,
// sin reproducir material protegido ni sustituir manuales oficiales.

export const OPCIONES_FRECUENCIA_0_3 = [
  { texto: "Nunca", valor: 0 },
  { texto: "Varios dias", valor: 1 },
  { texto: "Mas de la mitad de los dias", valor: 2 },
  { texto: "Casi todos los dias", valor: 3 }
];

const SI_NO = [
  { texto: "No", valor: 0 },
  { texto: "Si", valor: 1 }
];

function itemSelect(texto, dominio, opciones = OPCIONES_FRECUENCIA_0_3) {
  return { tipo: "select", texto, dominio, opciones };
}

function itemNumero(texto, dominio, min, max, ayuda = "") {
  return { tipo: "numero", texto, dominio, min, max, ayuda };
}

export const PRUEBAS_INTERACTIVAS = [
  {
    id: "phq9",
    nombre: "PHQ-9",
    tipoEscala: "psiquiatrica",
    area: "Depresion",
    puntajeMaximo: 27,
    rango: "0-27",
    modoInteractivo: "reactivos",
    descripcion: "Tamizaje de sintomas depresivos durante las ultimas 2 semanas.",
    instrucciones: "Lea cada reactivo y seleccione la frecuencia correspondiente.",
    referencias: "Kroenke K, Spitzer RL, Williams JBW. PHQ-9; puntos de corte 5, 10, 15 y 20.",
    interpretacion: [
      { max: 4, texto: "Minimo" },
      { max: 9, texto: "Leve" },
      { max: 14, texto: "Moderado" },
      { max: 19, texto: "Moderadamente grave" },
      { max: 27, texto: "Grave" }
    ],
    reactivos: [
      itemSelect("Poco interes o placer en hacer cosas.", "Depresion"),
      itemSelect("Sentirse triste, deprimido o sin esperanza.", "Depresion"),
      itemSelect("Problemas para dormir o dormir demasiado.", "Neurovegetativo"),
      itemSelect("Cansancio o poca energia.", "Neurovegetativo"),
      itemSelect("Poco apetito o comer en exceso.", "Neurovegetativo"),
      itemSelect("Sentirse mal consigo mismo o que ha fallado.", "Cognitivo-afectivo"),
      itemSelect("Dificultad para concentrarse.", "Cognitivo"),
      itemSelect("Moverse o hablar lento, o estar inquieto.", "Psicomotor"),
      itemSelect("Pensamientos de muerte o autolesion.", "Riesgo")
    ]
  },
  {
    id: "gad7",
    nombre: "GAD-7",
    tipoEscala: "psiquiatrica",
    area: "Ansiedad",
    puntajeMaximo: 21,
    rango: "0-21",
    modoInteractivo: "reactivos",
    descripcion: "Tamizaje de ansiedad durante las ultimas 2 semanas.",
    instrucciones: "Seleccione la frecuencia de cada sintoma.",
    referencias: "Spitzer RL et al. GAD-7; puntos de corte 5, 10 y 15.",
    interpretacion: [
      { max: 4, texto: "Minimo" },
      { max: 9, texto: "Leve" },
      { max: 14, texto: "Moderado" },
      { max: 21, texto: "Grave" }
    ],
    reactivos: [
      itemSelect("Sentirse nervioso, ansioso o al limite.", "Ansiedad"),
      itemSelect("No poder parar o controlar la preocupacion.", "Preocupacion"),
      itemSelect("Preocuparse demasiado por diferentes cosas.", "Preocupacion"),
      itemSelect("Dificultad para relajarse.", "Ansiedad somatica"),
      itemSelect("Estar tan inquieto que es dificil quedarse quieto.", "Inquietud"),
      itemSelect("Irritarse o molestarse con facilidad.", "Irritabilidad"),
      itemSelect("Sentir miedo como si algo terrible pudiera pasar.", "Miedo anticipatorio")
    ]
  },
  {
    id: "audit",
    nombre: "AUDIT",
    tipoEscala: "psiquiatrica",
    area: "Alcohol",
    puntajeMaximo: 40,
    rango: "0-40",
    modoInteractivo: "reactivos",
    descripcion: "Tamizaje de consumo de alcohol y problemas relacionados.",
    instrucciones: "Aplique los 10 reactivos y seleccione la opcion equivalente al manual usado.",
    referencias: "WHO AUDIT; interpretacion orientativa: 0-7 bajo riesgo, 8-15 riesgo, 16-19 perjudicial, 20+ dependencia probable.",
    interpretacion: [
      { max: 7, texto: "Bajo riesgo" },
      { max: 15, texto: "Consumo de riesgo" },
      { max: 19, texto: "Consumo perjudicial posible" },
      { max: 40, texto: "Posible dependencia; requiere valoracion clinica" }
    ],
    reactivos: Array.from({ length: 10 }, (_, index) => itemSelect(`AUDIT reactivo ${index + 1} (usar redaccion oficial autorizada).`, "Alcohol", [
      { texto: "0 puntos", valor: 0 },
      { texto: "1 punto", valor: 1 },
      { texto: "2 puntos", valor: 2 },
      { texto: "3 puntos", valor: 3 },
      { texto: "4 puntos", valor: 4 }
    ]))
  },
  {
    id: "ciwa_ar",
    nombre: "CIWA-Ar",
    tipoEscala: "psiquiatrica",
    area: "Abstinencia alcoholica",
    puntajeMaximo: 67,
    rango: "0-67",
    modoInteractivo: "reactivos",
    descripcion: "Evaluacion de gravedad del sindrome de abstinencia alcoholica.",
    instrucciones: "Valore clinicamente cada dominio de acuerdo con la escala CIWA-Ar usada en su institucion.",
    referencias: "CIWA-Ar; uso clinico habitual: <10 leve, 10-18 moderada, >=19 grave, sujeto a protocolo institucional.",
    interpretacion: [
      { max: 9, texto: "Abstinencia leve o minima" },
      { max: 18, texto: "Abstinencia moderada" },
      { max: 67, texto: "Abstinencia grave; requiere manejo clinico estrecho" }
    ],
    reactivos: [
      itemNumero("Nausea y vomito", "Autonomico", 0, 7),
      itemNumero("Temblor", "Neuromotor", 0, 7),
      itemNumero("Sudoracion paroxistica", "Autonomico", 0, 7),
      itemNumero("Ansiedad", "Afectivo", 0, 7),
      itemNumero("Agitacion", "Conductual", 0, 7),
      itemNumero("Alteraciones tactiles", "Sensopercepcion", 0, 7),
      itemNumero("Alteraciones auditivas", "Sensopercepcion", 0, 7),
      itemNumero("Alteraciones visuales", "Sensopercepcion", 0, 7),
      itemNumero("Cefalea / plenitud cefalica", "Somatico", 0, 7),
      itemNumero("Orientacion y sensorio", "Orientacion", 0, 4)
    ]
  },
  {
    id: "ciwa_b",
    nombre: "CIWA-B",
    tipoEscala: "psiquiatrica",
    area: "Abstinencia benzodiacepinas",
    puntajeMaximo: 80,
    rango: "0-80",
    modoInteractivo: "reactivos",
    descripcion: "Evaluacion de gravedad de abstinencia por benzodiacepinas.",
    instrucciones: "Use la version autorizada del instrumento y capture la intensidad por reactivo.",
    referencias: "CIWA-B; interpretar segun protocolo clinico/local y evolucion longitudinal.",
    interpretacion: [
      { max: 20, texto: "Sintomatologia leve" },
      { max: 40, texto: "Sintomatologia moderada" },
      { max: 80, texto: "Sintomatologia severa; valorar manejo especializado" }
    ],
    reactivos: Array.from({ length: 20 }, (_, index) => itemSelect(`CIWA-B reactivo ${index + 1} (usar redaccion oficial autorizada).`, "Abstinencia benzodiacepinas", [
      { texto: "0 Ausente", valor: 0 },
      { texto: "1 Leve", valor: 1 },
      { texto: "2 Moderado", valor: 2 },
      { texto: "3 Marcado", valor: 3 },
      { texto: "4 Severo", valor: 4 }
    ]))
  },
  {
    id: "minicog",
    nombre: "Mini-Cog",
    tipoEscala: "cognitiva",
    area: "Cognitiva",
    puntajeMaximo: 5,
    rango: "0-5",
    modoInteractivo: "guiada",
    descripcion: "Tamizaje breve con recuerdo de palabras y dibujo del reloj.",
    instrucciones: "Guie la aplicacion y califique recuerdo y reloj.",
    referencias: "Borson et al.; punto de corte orientativo <=2 positivo/sospechoso.",
    interpretacion: [
      { max: 2, texto: "Tamizaje positivo o sospechoso; requiere evaluacion clinica" },
      { max: 5, texto: "Tamizaje sin alteracion evidente, sujeto a contexto clinico" }
    ],
    reactivos: [
      itemNumero("Recuerdo diferido de 3 palabras", "Memoria", 0, 3, "Indique tres palabras, distraiga con reloj y registre cuantas recuerda."),
      itemNumero("Dibujo del reloj", "Visuoespacial", 0, 2, "Califique contorno/numeros/manecillas segun criterio usado.")
    ],
    pasos: ["Presentar tres palabras", "Solicitar dibujo de reloj", "Solicitar recuerdo diferido"]
  },
  {
    id: "clock_drawing",
    nombre: "Test del reloj",
    tipoEscala: "cognitiva",
    area: "Cognitiva",
    puntajeMaximo: 5,
    rango: "0-5",
    modoInteractivo: "guiada",
    descripcion: "Prueba visuoespacial y ejecutiva con dibujo del reloj.",
    instrucciones: "Solicite dibujo del reloj y hora indicada por el sistema de puntuacion elegido.",
    referencias: "Sunderland/Shulman; existen multiples sistemas, documente el usado.",
    interpretacion: [
      { max: 2, texto: "Alteracion posible; requiere integracion clinica" },
      { max: 5, texto: "Rango generalmente conservado segun sistema 0-5" }
    ],
    reactivos: [itemNumero("Puntaje total del reloj", "Visuoespacial", 0, 5, "Use el sistema 0-5 elegido y documentelo en observaciones.")],
    estimulo: "Espacio para dibujo en papel/tablet; adjuntos se integraran en una fase posterior."
  },
  {
    id: "fluencia_semantica",
    nombre: "Fluencia verbal semantica",
    tipoEscala: "cognitiva",
    area: "Lenguaje",
    puntajeMaximo: null,
    rango: "Numero de palabras en 60 s",
    modoInteractivo: "temporizada",
    descripcion: "Generacion de palabras por categoria durante 60 segundos.",
    instrucciones: "Solicite una categoria semantica, cronometre 60 segundos y registre respuestas validas/perseveraciones.",
    referencias: "Interpretar con normas por edad, escolaridad e idioma.",
    interpretacion: [],
    reactivos: [
      itemNumero("Palabras validas en 60 segundos", "Lenguaje", 0, 200),
      itemNumero("Perseveraciones / errores", "Control ejecutivo", 0, 200)
    ],
    duracionSegundos: 60
  },
  {
    id: "fluencia_fonologica",
    nombre: "Fluencia verbal fonologica",
    tipoEscala: "cognitiva",
    area: "Lenguaje",
    puntajeMaximo: null,
    rango: "Numero de palabras en 60 s",
    modoInteractivo: "temporizada",
    descripcion: "Generacion de palabras por letra durante 60 segundos.",
    instrucciones: "Indique la letra objetivo, cronometre 60 segundos y registre respuestas validas/perseveraciones.",
    referencias: "Interpretar con normas por edad, escolaridad e idioma.",
    interpretacion: [],
    reactivos: [
      itemNumero("Palabras validas en 60 segundos", "Lenguaje", 0, 200),
      itemNumero("Perseveraciones / errores", "Control ejecutivo", 0, 200)
    ],
    duracionSegundos: 60
  },
  {
    id: "digitos_directos_inversos",
    nombre: "Digitos directos e inversos",
    tipoEscala: "cognitiva",
    area: "Atencion / memoria de trabajo",
    puntajeMaximo: null,
    rango: "Span maximo / aciertos",
    modoInteractivo: "guiada",
    descripcion: "Evaluacion de atencion inmediata y memoria de trabajo.",
    instrucciones: "Lea series crecientes y registre span maximo directo e inverso.",
    referencias: "Interpretar segun normas del instrumento/bateria utilizada.",
    interpretacion: [],
    reactivos: [
      itemNumero("Span maximo directo", "Atencion", 0, 12),
      itemNumero("Span maximo inverso", "Memoria de trabajo", 0, 12),
      itemNumero("Aciertos totales", "Atencion", 0, 30)
    ]
  },
  {
    id: "trail_making_ab",
    nombre: "Trail Making Test A y B",
    tipoEscala: "cognitiva",
    area: "Cognitiva",
    puntajeMaximo: null,
    rango: "Tiempo en segundos / errores",
    modoInteractivo: "temporizada",
    descripcion: "Prueba cronometrada de velocidad de procesamiento y flexibilidad cognitiva.",
    instrucciones: "Use lamina autorizada/validada. Cronometre TMT-A y TMT-B y registre errores.",
    referencias: "Reitan Trail Making Test; interpretar con normas por edad/escolaridad.",
    interpretacion: [],
    reactivos: [
      itemNumero("TMT-A tiempo en segundos", "Velocidad de procesamiento", 0, 999),
      itemNumero("TMT-A errores", "Atencion", 0, 99),
      itemNumero("TMT-B tiempo en segundos", "Funciones ejecutivas", 0, 999),
      itemNumero("TMT-B errores", "Funciones ejecutivas", 0, 99)
    ],
    duracionSegundos: 300,
    usarTiempoPrincipal: true
  },
  {
    id: "mmse",
    nombre: "MMSE / Mini-Mental",
    tipoEscala: "cognitiva",
    area: "Cognitiva",
    puntajeMaximo: 30,
    rango: "0-30",
    modoInteractivo: "guiada_restringida",
    descripcion: "Tamizaje cognitivo general con aplicacion clinica estructurada.",
    instrucciones: "Use la version autorizada correspondiente. Cognicion guia dominios y calcula el total.",
    referencias: "Folstein et al., 1975; puntos de corte dependen de edad/escolaridad.",
    interpretacion: [
      { max: 23, texto: "Tamizaje bajo; valorar deterioro cognitivo segun escolaridad y edad" },
      { max: 30, texto: "Rango usualmente conservado, sujeto a contexto clinico" }
    ],
    reactivos: [
      itemNumero("Orientacion temporal y espacial", "Orientacion", 0, 10),
      itemNumero("Registro", "Memoria", 0, 3),
      itemNumero("Atencion / calculo", "Atencion", 0, 5),
      itemNumero("Recuerdo", "Memoria", 0, 3),
      itemNumero("Lenguaje / copia / praxis", "Lenguaje", 0, 9)
    ],
    requiereInstrumentoOficial: true
  },
  {
    id: "moca",
    nombre: "MoCA",
    tipoEscala: "cognitiva",
    area: "Cognitiva",
    puntajeMaximo: 30,
    rango: "0-30",
    modoInteractivo: "guiada_restringida",
    descripcion: "Tamizaje breve de deterioro cognitivo leve.",
    instrucciones: "Use material oficial MoCA. Cognicion guia dominios, ajuste educativo y calculo total.",
    referencias: "Nasreddine et al., 2005; usar version oficial vigente de MoCA.",
    interpretacion: [
      { max: 25, texto: "Resultado por debajo del punto de corte usual; requiere integracion clinica" },
      { max: 30, texto: "Dentro de rango esperado segun punto de corte usual, sujeto a contexto clinico" }
    ],
    reactivos: [
      itemNumero("Visuoespacial / ejecutivo", "Funciones ejecutivas", 0, 5),
      itemNumero("Denominacion", "Lenguaje", 0, 3),
      itemNumero("Atencion", "Atencion", 0, 6),
      itemNumero("Lenguaje", "Lenguaje", 0, 3),
      itemNumero("Abstraccion", "Funciones ejecutivas", 0, 2),
      itemNumero("Recuerdo diferido", "Memoria", 0, 5),
      itemNumero("Orientacion", "Orientacion", 0, 6),
      itemNumero("Ajuste educativo si aplica", "Ajuste", 0, 1)
    ],
    requiereInstrumentoOficial: true
  }
];

export function obtenerPruebaInteractiva(id) {
  return PRUEBAS_INTERACTIVAS.find((prueba) => prueba.id === id) || null;
}

export function interpretarPruebaInteractiva(prueba, puntaje) {
  const corte = prueba?.interpretacion?.find((item) => puntaje <= item.max);
  if (corte) return corte.texto;
  if (prueba?.usarTiempoPrincipal) return `Tiempo registrado: ${puntaje} segundos. Interpretar con normas por edad, escolaridad y condicion motora.`;
  if (prueba?.puntajeMaximo === null) return "Resultado registrado; interpretar con normas clinicas aplicables.";
  return "Resultado registrado; requiere integracion clinica.";
}

export function calcularPuntajePruebaInteractiva(prueba, respuestas = []) {
  if (prueba?.usarTiempoPrincipal) {
    const tmtB = respuestas.find((r) => /TMT-B tiempo/i.test(r.item || ""));
    const tmtA = respuestas.find((r) => /TMT-A tiempo/i.test(r.item || ""));
    return Number(tmtB?.valor ? tmtA?.valor ? 0);
  }
  return respuestas.reduce((total, respuesta) => total + Number(respuesta.valor || 0), 0);
}

export function puntajesDominioPruebaInteractiva(respuestas = []) {
  return respuestas.reduce((dominios, respuesta) => {
    const dominio = respuesta.dominio || "Sin dominio";
    dominios[dominio] = (dominios[dominio] || 0) + Number(respuesta.valor || 0);
    return dominios;
  }, {});
}
