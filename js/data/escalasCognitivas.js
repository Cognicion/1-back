export const ESCALAS_COGNITIVAS = [
  {
    id: "moca",
    nombre: "MoCA",
    subtitulo: "Montreal Cognitive Assessment",
    area: "Cognitiva",
    tipoEscala: "cognitiva",
    descripcion: "Tamizaje breve de deterioro cognitivo leve. Debe aplicarse con el material oficial y entrenamiento correspondiente.",
    poblacionSugerida: "Adultos con sospecha de deterioro cognitivo leve o cambios cognitivos.",
    dominiosEvaluados: ["Visuoespacial/ejecutivo", "Denominacion", "Atencion", "Lenguaje", "Abstraccion", "Recuerdo diferido", "Orientacion"],
    instrucciones: "Use el instrumento oficial MoCA. Registre aqui los puntajes por dominio y el ajuste educativo cuando aplique.",
    modoCaptura: "dominios",
    requiereInstrumentoOficial: true,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: 30,
    rango: "0-30",
    items: [
      { texto: "Visuoespacial / ejecutivo", dominio: "Funciones ejecutivas", tipo: "numero", min: 0, max: 5 },
      { texto: "Denominacion", dominio: "Lenguaje", tipo: "numero", min: 0, max: 3 },
      { texto: "Atencion", dominio: "Atencion", tipo: "numero", min: 0, max: 6 },
      { texto: "Lenguaje", dominio: "Lenguaje", tipo: "numero", min: 0, max: 3 },
      { texto: "Abstraccion", dominio: "Funciones ejecutivas", tipo: "numero", min: 0, max: 2 },
      { texto: "Recuerdo diferido", dominio: "Memoria", tipo: "numero", min: 0, max: 5 },
      { texto: "Orientacion", dominio: "Orientacion", tipo: "numero", min: 0, max: 6 }
    ],
    puntosCorte: [
      { max: 25, texto: "Resultado por debajo del punto de corte usual; requiere integracion clinica" },
      { max: 30, texto: "Dentro de rango esperado segun punto de corte usual, sujeto a contexto clinico" }
    ],
    limitaciones: "El punto de corte puede variar por escolaridad, idioma, edad y contexto cultural. No sustituye valoracion neuropsicologica.",
    referencias: ["Nasreddine et al., 2005", "MoCA Test Inc.; usar version oficial vigente"]
  },
  {
    id: "mmse",
    nombre: "MMSE / Mini-Mental",
    subtitulo: "Mini-Mental State Examination",
    area: "Cognitiva",
    tipoEscala: "cognitiva",
    descripcion: "Tamizaje cognitivo general. Registrar puntajes por dominio usando el instrumento autorizado correspondiente.",
    poblacionSugerida: "Adultos y adultos mayores en tamizaje cognitivo general.",
    dominiosEvaluados: ["Orientacion", "Registro", "Atencion/calculo", "Recuerdo", "Lenguaje/praxia"],
    instrucciones: "Aplique la version clinica autorizada y capture los puntajes por dominio.",
    modoCaptura: "dominios",
    requiereInstrumentoOficial: true,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: 30,
    rango: "0-30",
    items: [
      { texto: "Orientacion temporal y espacial", dominio: "Orientacion", tipo: "numero", min: 0, max: 10 },
      { texto: "Registro", dominio: "Memoria", tipo: "numero", min: 0, max: 3 },
      { texto: "Atencion / calculo", dominio: "Atencion", tipo: "numero", min: 0, max: 5 },
      { texto: "Recuerdo", dominio: "Memoria", tipo: "numero", min: 0, max: 3 },
      { texto: "Lenguaje / copia / praxis", dominio: "Lenguaje", tipo: "numero", min: 0, max: 9 }
    ],
    puntosCorte: [
      { max: 23, texto: "Tamizaje bajo; valorar deterioro cognitivo segun escolaridad y edad" },
      { max: 30, texto: "Rango usualmente conservado, sujeto a contexto clinico" }
    ],
    limitaciones: "Sensibilidad limitada para deterioro leve y sesgo por escolaridad. Usar interpretacion clinica.",
    referencias: ["Folstein et al., 1975"]
  },
  {
    id: "minicog",
    nombre: "Mini-Cog",
    subtitulo: "Tamizaje cognitivo breve",
    area: "Cognitiva",
    tipoEscala: "cognitiva",
    descripcion: "Tamizaje breve que combina recuerdo de palabras y prueba del reloj.",
    poblacionSugerida: "Adultos mayores o consultas donde se requiere tamizaje rapido.",
    dominiosEvaluados: ["Memoria", "Visuoespacial", "Funciones ejecutivas"],
    instrucciones: "Aplique el procedimiento oficial y capture recuerdo y reloj.",
    modoCaptura: "dominios",
    requiereInstrumentoOficial: false,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: 5,
    rango: "0-5",
    items: [
      { texto: "Recuerdo de palabras", dominio: "Memoria", tipo: "numero", min: 0, max: 3 },
      { texto: "Reloj", dominio: "Visuoespacial", tipo: "numero", min: 0, max: 2 }
    ],
    puntosCorte: [
      { max: 2, texto: "Tamizaje positivo o sospechoso; requiere evaluacion clinica" },
      { max: 5, texto: "Tamizaje sin alteracion evidente, sujeto a contexto clinico" }
    ],
    limitaciones: "No sustituye evaluacion cognitiva formal.",
    referencias: ["Borson et al., Mini-Cog"]
  },
  {
    id: "ace_iii",
    nombre: "ACE-III",
    subtitulo: "Addenbrooke's Cognitive Examination III",
    area: "Cognitiva",
    tipoEscala: "cognitiva",
    descripcion: "Evaluacion cognitiva amplia por dominios. Debe aplicarse con material oficial.",
    poblacionSugerida: "Evaluacion cognitiva clinica amplia.",
    dominiosEvaluados: ["Atencion", "Memoria", "Fluencia", "Lenguaje", "Visuoespacial"],
    instrucciones: "Use el instrumento oficial ACE-III. Capture puntajes por dominio.",
    modoCaptura: "dominios",
    requiereInstrumentoOficial: true,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: 100,
    rango: "0-100",
    items: [
      { texto: "Atencion", dominio: "Atencion", tipo: "numero", min: 0, max: 18 },
      { texto: "Memoria", dominio: "Memoria", tipo: "numero", min: 0, max: 26 },
      { texto: "Fluencia verbal", dominio: "Lenguaje", tipo: "numero", min: 0, max: 14 },
      { texto: "Lenguaje", dominio: "Lenguaje", tipo: "numero", min: 0, max: 26 },
      { texto: "Visuoespacial", dominio: "Visuoespacial", tipo: "numero", min: 0, max: 16 }
    ],
    puntosCorte: [
      { max: 81, texto: "Puntaje bajo; integrar con evaluacion clinica y normas disponibles" },
      { max: 87, texto: "Rango intermedio; interpretar con edad/escolaridad" },
      { max: 100, texto: "Rango generalmente conservado, sujeto a normas y contexto" }
    ],
    limitaciones: "Interpretacion depende de normas, edad, escolaridad e idioma.",
    referencias: ["Hsieh et al., 2013; ACE-III"]
  },
  {
    id: "trail_making_ab",
    nombre: "Trail Making Test A/B",
    subtitulo: "Velocidad, atencion y flexibilidad",
    area: "Cognitiva",
    tipoEscala: "cognitiva",
    descripcion: "Prueba cronometrada de velocidad de procesamiento y flexibilidad cognitiva.",
    poblacionSugerida: "Evaluacion de atencion, velocidad y funciones ejecutivas.",
    dominiosEvaluados: ["Atencion", "Velocidad de procesamiento", "Funciones ejecutivas"],
    instrucciones: "Use laminas oficiales o validadas. Registre tiempo en segundos y errores.",
    modoCaptura: "tiempo",
    requiereInstrumentoOficial: true,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: null,
    rango: "Tiempo en segundos / errores",
    items: [
      { texto: "TMT-A tiempo en segundos", dominio: "Velocidad de procesamiento", tipo: "numero", min: 0, max: 999 },
      { texto: "TMT-A errores", dominio: "Atencion", tipo: "numero", min: 0, max: 99 },
      { texto: "TMT-B tiempo en segundos", dominio: "Funciones ejecutivas", tipo: "numero", min: 0, max: 999 },
      { texto: "TMT-B errores", dominio: "Funciones ejecutivas", tipo: "numero", min: 0, max: 99 }
    ],
    interpretarPorTiempo: true,
    limitaciones: "Requiere normas por edad/escolaridad y condiciones motoras/visuales.",
    referencias: ["Reitan Trail Making Test; normas clinicas locales"]
  },
  {
    id: "fab",
    nombre: "FAB",
    subtitulo: "Frontal Assessment Battery",
    area: "Cognitiva",
    tipoEscala: "cognitiva",
    descripcion: "Tamizaje de funciones frontales. Registrar subpuntajes sin reproducir material protegido.",
    poblacionSugerida: "Sospecha de disfuncion ejecutiva/frontal.",
    dominiosEvaluados: ["Conceptualizacion", "Flexibilidad", "Programacion", "Inhibicion", "Autonomia frontal"],
    instrucciones: "Aplique el material clinico correspondiente y capture 0-3 por subprueba.",
    modoCaptura: "dominios",
    requiereInstrumentoOficial: true,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: 18,
    rango: "0-18",
    items: [
      { texto: "Conceptualizacion", dominio: "Funciones ejecutivas", tipo: "numero", min: 0, max: 3 },
      { texto: "Flexibilidad mental", dominio: "Funciones ejecutivas", tipo: "numero", min: 0, max: 3 },
      { texto: "Programacion motora", dominio: "Funciones ejecutivas", tipo: "numero", min: 0, max: 3 },
      { texto: "Sensibilidad a interferencia", dominio: "Funciones ejecutivas", tipo: "numero", min: 0, max: 3 },
      { texto: "Control inhibitorio", dominio: "Funciones ejecutivas", tipo: "numero", min: 0, max: 3 },
      { texto: "Autonomia ambiental", dominio: "Funciones ejecutivas", tipo: "numero", min: 0, max: 3 }
    ],
    puntosCorte: [
      { max: 11, texto: "Puntaje bajo; sugiere disfuncion frontal a integrar clinicamente" },
      { max: 18, texto: "Rango generalmente conservado, sujeto a contexto" }
    ],
    limitaciones: "Interpretar con normas y contexto neurologico/psiquiatrico.",
    referencias: ["Dubois et al., 2000"]
  },
  {
    id: "clock_drawing",
    nombre: "Clock Drawing Test",
    subtitulo: "Prueba del dibujo del reloj",
    area: "Cognitiva",
    tipoEscala: "cognitiva",
    descripcion: "Prueba breve de habilidades visuoespaciales y ejecutivas.",
    poblacionSugerida: "Tamizaje cognitivo breve.",
    dominiosEvaluados: ["Visuoespacial", "Funciones ejecutivas"],
    instrucciones: "Use el sistema de puntuacion elegido por el clinico y capture el total.",
    modoCaptura: "total",
    requiereInstrumentoOficial: false,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: 5,
    rango: "0-5",
    items: [
      { texto: "Puntaje total del reloj segun sistema usado", dominio: "Visuoespacial", tipo: "numero", min: 0, max: 5 }
    ],
    puntosCorte: [
      { max: 2, texto: "Alteracion posible; requiere integracion clinica" },
      { max: 5, texto: "Rango generalmente conservado segun sistema 0-5" }
    ],
    limitaciones: "Existen multiples sistemas de correccion; documente el utilizado.",
    referencias: ["Sunderland et al.; Shulman clock drawing scoring"]
  },
  {
    id: "gds_global",
    nombre: "GDS",
    subtitulo: "Global Deterioration Scale",
    area: "Cognitiva",
    tipoEscala: "cognitiva",
    descripcion: "Estadiaje global de deterioro cognitivo.",
    poblacionSugerida: "Seguimiento clinico de deterioro cognitivo/demencia.",
    dominiosEvaluados: ["Funcion global", "Memoria", "Funcionalidad"],
    instrucciones: "Seleccione el estadio global de acuerdo con entrevista clinica y funcionalidad.",
    modoCaptura: "estadio",
    requiereInstrumentoOficial: false,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: 7,
    rango: "1-7",
    items: [
      {
        texto: "Estadio global",
        dominio: "Funcion global",
        tipo: "select",
        opciones: ["1 Sin deterioro", "2 Deterioro muy leve", "3 Deterioro leve", "4 Deterioro moderado", "5 Moderadamente grave", "6 Grave", "7 Muy grave"],
        valores: [1, 2, 3, 4, 5, 6, 7]
      }
    ],
    interpretacionPorValor: {
      1: "Sin deterioro cognitivo global",
      2: "Deterioro cognitivo muy leve",
      3: "Deterioro cognitivo leve",
      4: "Deterioro cognitivo moderado",
      5: "Deterioro cognitivo moderadamente grave",
      6: "Deterioro cognitivo grave",
      7: "Deterioro cognitivo muy grave"
    },
    limitaciones: "Es una escala global; requiere juicio clinico longitudinal.",
    referencias: ["Reisberg et al., Global Deterioration Scale"]
  },
  {
    id: "pfeiffer_spmsq",
    nombre: "Pfeiffer / SPMSQ",
    subtitulo: "Short Portable Mental Status Questionnaire",
    area: "Cognitiva",
    tipoEscala: "cognitiva",
    descripcion: "Tamizaje breve por numero de errores.",
    poblacionSugerida: "Adultos mayores o pacientes con sospecha de deterioro cognitivo.",
    dominiosEvaluados: ["Orientacion", "Memoria", "Atencion"],
    instrucciones: "Aplique el cuestionario correspondiente y capture numero de errores.",
    modoCaptura: "errores",
    requiereInstrumentoOficial: false,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: 10,
    rango: "0-10 errores",
    items: [
      { texto: "Numero de errores", dominio: "Cognicion global", tipo: "numero", min: 0, max: 10 }
    ],
    interpretaErrores: true,
    limitaciones: "Puede ajustarse por escolaridad; interprete con contexto cultural y educativo.",
    referencias: ["Pfeiffer, 1975"]
  },
  {
    id: "ad8",
    nombre: "AD8",
    subtitulo: "Ascertain Dementia 8-item Informant Interview",
    area: "Cognitiva",
    tipoEscala: "cognitiva",
    descripcion: "Entrevista breve a informante para cambios cognitivos/funcionales.",
    poblacionSugerida: "Tamizaje con informante confiable.",
    dominiosEvaluados: ["Cambio cognitivo", "Funcionamiento"],
    instrucciones: "Use el instrumento correspondiente y capture numero de respuestas positivas.",
    modoCaptura: "total",
    requiereInstrumentoOficial: true,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: 8,
    rango: "0-8",
    items: [
      { texto: "Numero de respuestas positivas", dominio: "Cambio cognitivo", tipo: "numero", min: 0, max: 8 }
    ],
    puntosCorte: [
      { max: 1, texto: "Tamizaje sin datos suficientes de deterioro por AD8" },
      { max: 8, texto: "Tamizaje positivo; valorar deterioro cognitivo" }
    ],
    limitaciones: "Requiere informante y confirmacion clinica.",
    referencias: ["Galvin et al., AD8"]
  },
  {
    id: "lawton_brody",
    nombre: "Lawton-Brody",
    subtitulo: "Actividades instrumentales de la vida diaria",
    area: "Funcional",
    tipoEscala: "cognitiva",
    descripcion: "Valoracion funcional instrumental.",
    poblacionSugerida: "Adultos con sospecha de deterioro funcional.",
    dominiosEvaluados: ["Funcionalidad", "Autonomia"],
    instrucciones: "Capture el puntaje total segun la version usada.",
    modoCaptura: "total",
    requiereInstrumentoOficial: false,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: 8,
    rango: "0-8",
    items: [
      { texto: "Puntaje total", dominio: "Funcionalidad instrumental", tipo: "numero", min: 0, max: 8 }
    ],
    puntosCorte: [
      { max: 3, texto: "Dependencia instrumental importante" },
      { max: 6, texto: "Dependencia instrumental parcial" },
      { max: 8, texto: "Independencia instrumental relativa" }
    ],
    limitaciones: "Algunas versiones varian por sexo/contexto cultural. Documente version usada.",
    referencias: ["Lawton & Brody, 1969"]
  },
  {
    id: "barthel",
    nombre: "Barthel",
    subtitulo: "Indice de Barthel",
    area: "Funcional",
    tipoEscala: "cognitiva",
    descripcion: "Valoracion de actividades basicas de la vida diaria.",
    poblacionSugerida: "Pacientes con dependencia funcional, neurologica, geriatrica o rehabilitacion.",
    dominiosEvaluados: ["Funcionalidad", "Autonomia"],
    instrucciones: "Capture el puntaje total segun la version de 0 a 100 utilizada.",
    modoCaptura: "total",
    requiereInstrumentoOficial: false,
    visibilidadPaciente: false,
    puedeHacersePorPaciente: false,
    requiereAplicadorClinico: true,
    puntajeMaximo: 100,
    rango: "0-100",
    items: [
      { texto: "Puntaje total", dominio: "Funcionalidad basica", tipo: "numero", min: 0, max: 100 }
    ],
    puntosCorte: [
      { max: 20, texto: "Dependencia total" },
      { max: 60, texto: "Dependencia severa" },
      { max: 90, texto: "Dependencia moderada" },
      { max: 99, texto: "Dependencia leve" },
      { max: 100, texto: "Independencia" }
    ],
    limitaciones: "No mide cognicion directamente; complementa perfil funcional.",
    referencias: ["Mahoney & Barthel, 1965"]
  }
];

export function calcularPuntajeEscalaCognitiva(escala, respuestas = []) {
  if (escala?.modoCaptura === "tiempo") {
    const tmtB = respuestas.find((respuesta) => /TMT-B tiempo/i.test(respuesta.item || ""));
    const tmtA = respuestas.find((respuesta) => /TMT-A tiempo/i.test(respuesta.item || ""));
    return Number(tmtB?.valor ? tmtA?.valor ? 0);
  }

  return respuestas.reduce((total, respuesta) => total + Number(respuesta.valor || 0), 0);
}

export function obtenerPuntajesDominioCognitivo(respuestas = []) {
  return respuestas.reduce((dominios, respuesta) => {
    const dominio = respuesta.dominio || "Sin dominio";
    dominios[dominio] = (dominios[dominio] || 0) + Number(respuesta.valor || 0);
    return dominios;
  }, {});
}

export function interpretarEscalaCognitiva(escala, puntaje, respuestas = []) {
  if (!escala) return "Sin interpretacion";

  if (escala.interpretarPorTiempo) {
    const errores = respuestas
      .filter((respuesta) => /errores/i.test(respuesta.item || ""))
      .reduce((total, respuesta) => total + Number(respuesta.valor || 0), 0);
    return `Tiempo registrado: ${puntaje} segundos. Errores: ${errores}. Interpretar con normas por edad, escolaridad y condicion motora.`;
  }

  if (escala.interpretaErrores) {
    if (puntaje <= 2) return "Funcionamiento cognitivo conservado segun errores SPMSQ, sujeto a escolaridad.";
    if (puntaje <= 4) return "Deterioro cognitivo leve sugerido por SPMSQ.";
    if (puntaje <= 7) return "Deterioro cognitivo moderado sugerido por SPMSQ.";
    return "Deterioro cognitivo severo sugerido por SPMSQ.";
  }

  if (escala.interpretacionPorValor?.[puntaje]) {
    return escala.interpretacionPorValor[puntaje];
  }

  const corte = escala.puntosCorte?.find((punto) => puntaje <= punto.max);
  return corte?.texto || "Resultado registrado; requiere integracion clinica.";
}
