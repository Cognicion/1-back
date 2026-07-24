const SI_NO = [
  { texto: "No", valor: 0 },
  { texto: "Si", valor: 1 }
];

const RIESGO_BAJO_MODERADO_ALTO = [
  { max: 0, texto: "Riesgo bajo o no sugerido por esta escala" },
  { max: 2, texto: "Riesgo moderado / requiere correlacion clinica" },
  { max: 99, texto: "Riesgo alto / requiere valoracion clinica prioritaria" }
];

export const ESCALAS_MEDICINA_GENERAL = [
  {
    id: "news2",
    nombre: "NEWS2",
    area: "Medicina general",
    subtitulo: "National Early Warning Score 2",
    descripcion: "Alerta temprana para deterioro clinico agudo en adultos. Requiere interpretacion clinica y protocolos locales.",
    rango: "0-20+",
    puntajeMaximo: 20,
    puntosCorte: [
      { max: 0, texto: "Bajo riesgo" },
      { max: 4, texto: "Bajo riesgo; vigilancia clinica" },
      { max: 6, texto: "Riesgo medio; valorar respuesta clinica urgente" },
      { max: 99, texto: "Alto riesgo; requiere valoracion urgente" }
    ],
    consideraciones: [
      "Una puntuacion de 3 en un solo parametro tambien puede indicar riesgo relevante.",
      "Use los protocolos institucionales para escalamiento de atencion."
    ],
    items: [
      { texto: "Frecuencia respiratoria", opciones: [{ texto: "12-20", valor: 0 }, { texto: "9-11", valor: 1 }, { texto: "21-24", valor: 2 }, { texto: "<=8 o >=25", valor: 3 }] },
      { texto: "Saturacion O2 escala 1", opciones: [{ texto: ">=96%", valor: 0 }, { texto: "94-95%", valor: 1 }, { texto: "92-93%", valor: 2 }, { texto: "<=91%", valor: 3 }] },
      { texto: "Oxigeno suplementario", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: 2 }] },
      { texto: "Temperatura", opciones: [{ texto: "36.1-38.0 C", valor: 0 }, { texto: "35.1-36.0 C", valor: 1 }, { texto: "38.1-39.0 C", valor: 1 }, { texto: "<=35.0 C o >=39.1 C", valor: 3 }] },
      { texto: "Presion sistolica", opciones: [{ texto: "111-219 mmHg", valor: 0 }, { texto: "101-110 mmHg", valor: 1 }, { texto: "91-100 mmHg", valor: 2 }, { texto: "<=90 o >=220 mmHg", valor: 3 }] },
      { texto: "Frecuencia cardiaca", opciones: [{ texto: "51-90 lpm", valor: 0 }, { texto: "41-50 o 91-110 lpm", valor: 1 }, { texto: "111-130 lpm", valor: 2 }, { texto: "<=40 o >=131 lpm", valor: 3 }] },
      { texto: "Estado de conciencia", opciones: [{ texto: "Alerta", valor: 0 }, { texto: "Confusion nueva, voz, dolor o no responde", valor: 3 }] }
    ]
  },
  {
    id: "qsofa",
    nombre: "qSOFA",
    area: "Sepsis",
    descripcion: "Tamizaje rapido de riesgo de mala evolucion en infeccion sospechada.",
    rango: "0-3",
    puntajeMaximo: 3,
    puntosCorte: [
      { max: 1, texto: "Menor riesgo por qSOFA" },
      { max: 3, texto: "Mayor riesgo; requiere evaluacion clinica y vigilancia estrecha" }
    ],
    items: [
      { texto: "Frecuencia respiratoria >= 22/min", opciones: SI_NO },
      { texto: "Presion sistolica <= 100 mmHg", opciones: SI_NO },
      { texto: "Alteracion del estado mental", opciones: SI_NO }
    ]
  },
  {
    id: "sirs",
    nombre: "SIRS",
    area: "Respuesta inflamatoria",
    descripcion: "Criterios de respuesta inflamatoria sistemica; no sustituye la evaluacion etiologica.",
    rango: "0-4",
    puntajeMaximo: 4,
    puntosCorte: [
      { max: 1, texto: "No cumple SIRS por puntuacion" },
      { max: 4, texto: "Cumple criterios SIRS; correlacionar con contexto clinico" }
    ],
    items: [
      { texto: "Temperatura >38 C o <36 C", opciones: SI_NO },
      { texto: "Frecuencia cardiaca >90 lpm", opciones: SI_NO },
      { texto: "FR >20/min o PaCO2 <32 mmHg", opciones: SI_NO },
      { texto: "Leucocitos >12,000, <4,000 o bandas >10%", opciones: SI_NO }
    ]
  },
  {
    id: "gcs",
    nombre: "Glasgow",
    area: "Neurologia",
    subtitulo: "Escala de coma de Glasgow",
    descripcion: "Evaluacion del nivel de conciencia mediante apertura ocular, respuesta verbal y motora.",
    rango: "3-15",
    puntajeMaximo: 15,
    puntosCorte: [
      { max: 8, texto: "Compromiso severo" },
      { max: 12, texto: "Compromiso moderado" },
      { max: 15, texto: "Compromiso leve o normal segun contexto" }
    ],
    items: [
      { texto: "Apertura ocular", opciones: [{ texto: "Ninguna", valor: 1 }, { texto: "Al dolor", valor: 2 }, { texto: "A la voz", valor: 3 }, { texto: "Espontanea", valor: 4 }] },
      { texto: "Respuesta verbal", opciones: [{ texto: "Ninguna", valor: 1 }, { texto: "Sonidos incomprensibles", valor: 2 }, { texto: "Palabras inapropiadas", valor: 3 }, { texto: "Confusa", valor: 4 }, { texto: "Orientada", valor: 5 }] },
      { texto: "Respuesta motora", opciones: [{ texto: "Ninguna", valor: 1 }, { texto: "Extension", valor: 2 }, { texto: "Flexion anormal", valor: 3 }, { texto: "Retirada", valor: 4 }, { texto: "Localiza dolor", valor: 5 }, { texto: "Obedece ordenes", valor: 6 }] }
    ]
  },
  {
    id: "four",
    nombre: "FOUR Score",
    area: "Neurologia",
    descripcion: "Evaluacion neurologica en pacientes con alteracion de conciencia, incluyendo respiracion y reflejos de tallo.",
    rango: "0-16",
    puntajeMaximo: 16,
    puntosCorte: [
      { max: 7, texto: "Compromiso neurologico alto" },
      { max: 12, texto: "Compromiso moderado" },
      { max: 16, texto: "Mejor respuesta neurologica" }
    ],
    items: [
      { texto: "Respuesta ocular", opciones: [{ texto: "Parpados cerrados, no abren", valor: 0 }, { texto: "Abre al dolor", valor: 1 }, { texto: "Abre a voz", valor: 2 }, { texto: "Sigue objetos", valor: 3 }, { texto: "Parpadea a comando", valor: 4 }] },
      { texto: "Respuesta motora", opciones: [{ texto: "Ninguna/mioclonias", valor: 0 }, { texto: "Extension", valor: 1 }, { texto: "Flexion", valor: 2 }, { texto: "Localiza dolor", valor: 3 }, { texto: "Pulgar arriba, puno o paz", valor: 4 }] },
      { texto: "Reflejos de tallo", opciones: [{ texto: "Ausentes", valor: 0 }, { texto: "Pupilar o corneal ausente", valor: 1 }, { texto: "Pupilar o corneal presente", valor: 2 }, { texto: "Pupilar y corneal presentes", valor: 4 }] },
      { texto: "Respiracion", opciones: [{ texto: "Apnea", valor: 0 }, { texto: "Ventilador sobre frecuencia", valor: 1 }, { texto: "Respira sobre ventilador", valor: 2 }, { texto: "No intubado, Cheyne-Stokes", valor: 3 }, { texto: "No intubado, regular", valor: 4 }] }
    ]
  },
  {
    id: "rass",
    nombre: "RASS",
    area: "Sedacion",
    subtitulo: "Richmond Agitation-Sedation Scale",
    descripcion: "Nivel de sedacion o agitacion. Valor negativo indica sedacion; positivo indica agitacion.",
    rango: "-5 a +4",
    puntajeMaximo: 4,
    puntosCorte: [
      { max: -4, texto: "Sedacion profunda" },
      { max: -1, texto: "Sedacion ligera a moderada" },
      { max: 0, texto: "Alerta y calmado" },
      { max: 4, texto: "Agitacion" }
    ],
    items: [
      { texto: "Nivel RASS", opciones: [{ texto: "-5 No despierta", valor: -5 }, { texto: "-4 Sedacion profunda", valor: -4 }, { texto: "-3 Sedacion moderada", valor: -3 }, { texto: "-2 Sedacion ligera", valor: -2 }, { texto: "-1 Somnoliento", valor: -1 }, { texto: "0 Alerta y calmado", valor: 0 }, { texto: "+1 Inquieto", valor: 1 }, { texto: "+2 Agitado", valor: 2 }, { texto: "+3 Muy agitado", valor: 3 }, { texto: "+4 Combativo", valor: 4 }] }
    ]
  },
  {
    id: "ramsay",
    nombre: "Ramsay",
    area: "Sedacion",
    descripcion: "Escala clinica de sedacion.",
    rango: "1-6",
    puntajeMaximo: 6,
    puntosCorte: [
      { max: 1, texto: "Ansioso/agitado" },
      { max: 3, texto: "Sedacion ligera" },
      { max: 6, texto: "Sedacion profunda" }
    ],
    items: [
      { texto: "Nivel Ramsay", opciones: [{ texto: "1 Ansioso/agitado", valor: 1 }, { texto: "2 Cooperador/tranquilo", valor: 2 }, { texto: "3 Responde a ordenes", valor: 3 }, { texto: "4 Respuesta rapida a estimulo", valor: 4 }, { texto: "5 Respuesta lenta a estimulo", valor: 5 }, { texto: "6 Sin respuesta", valor: 6 }] }
    ]
  },
  {
    id: "morse",
    nombre: "Morse",
    area: "Riesgo de caidas",
    descripcion: "Estimacion del riesgo de caidas en pacientes hospitalizados.",
    rango: "0-125",
    puntajeMaximo: 125,
    puntosCorte: [
      { max: 24, texto: "Riesgo bajo" },
      { max: 45, texto: "Riesgo moderado" },
      { max: 125, texto: "Riesgo alto" }
    ],
    items: [
      { texto: "Historia de caidas", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: 25 }] },
      { texto: "Diagnostico secundario", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: 15 }] },
      { texto: "Ayuda para deambulacion", opciones: [{ texto: "Ninguna/reposo/asistencia enfermeria", valor: 0 }, { texto: "Baston/muletas/andadera", valor: 15 }, { texto: "Muebles", valor: 30 }] },
      { texto: "Terapia IV/heparina lock", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: 20 }] },
      { texto: "Marcha", opciones: [{ texto: "Normal/reposo/inmovil", valor: 0 }, { texto: "Debil", valor: 10 }, { texto: "Alterada", valor: 20 }] },
      { texto: "Estado mental", opciones: [{ texto: "Reconoce limitaciones", valor: 0 }, { texto: "Sobreestima/olvida limitaciones", valor: 15 }] }
    ]
  },
  {
    id: "braden",
    nombre: "Braden",
    area: "Ulceras por presion",
    descripcion: "Riesgo de lesiones por presion. Menor puntaje indica mayor riesgo.",
    rango: "6-23",
    puntajeMaximo: 23,
    puntosCorte: [
      { max: 9, texto: "Riesgo muy alto" },
      { max: 12, texto: "Riesgo alto" },
      { max: 14, texto: "Riesgo moderado" },
      { max: 18, texto: "Riesgo leve" },
      { max: 23, texto: "Sin riesgo relevante por escala" }
    ],
    items: [
      { texto: "Percepcion sensorial", opciones: [{ texto: "Completamente limitada", valor: 1 }, { texto: "Muy limitada", valor: 2 }, { texto: "Ligeramente limitada", valor: 3 }, { texto: "Sin limitacion", valor: 4 }] },
      { texto: "Humedad", opciones: [{ texto: "Constantemente humeda", valor: 1 }, { texto: "Muy humeda", valor: 2 }, { texto: "Ocasionalmente humeda", valor: 3 }, { texto: "Rara vez humeda", valor: 4 }] },
      { texto: "Actividad", opciones: [{ texto: "Encamado", valor: 1 }, { texto: "En silla", valor: 2 }, { texto: "Camina ocasionalmente", valor: 3 }, { texto: "Camina frecuentemente", valor: 4 }] },
      { texto: "Movilidad", opciones: [{ texto: "Completamente inmovil", valor: 1 }, { texto: "Muy limitada", valor: 2 }, { texto: "Ligeramente limitada", valor: 3 }, { texto: "Sin limitacion", valor: 4 }] },
      { texto: "Nutricion", opciones: [{ texto: "Muy pobre", valor: 1 }, { texto: "Probablemente inadecuada", valor: 2 }, { texto: "Adecuada", valor: 3 }, { texto: "Excelente", valor: 4 }] },
      { texto: "Friccion/cizallamiento", opciones: [{ texto: "Problema", valor: 1 }, { texto: "Problema potencial", valor: 2 }, { texto: "Sin problema aparente", valor: 3 }] }
    ]
  },
  {
    id: "curb65",
    nombre: "CURB-65",
    area: "Neumonia",
    descripcion: "Estratificacion de gravedad en neumonia adquirida en la comunidad.",
    rango: "0-5",
    puntajeMaximo: 5,
    puntosCorte: [
      { max: 1, texto: "Bajo riesgo" },
      { max: 2, texto: "Riesgo intermedio" },
      { max: 5, texto: "Alto riesgo" }
    ],
    items: [
      { texto: "Confusion", opciones: SI_NO },
      { texto: "Urea >7 mmol/L o BUN elevado", opciones: SI_NO },
      { texto: "FR >=30/min", opciones: SI_NO },
      { texto: "PAS <90 o PAD <=60 mmHg", opciones: SI_NO },
      { texto: "Edad >=65 años", opciones: SI_NO }
    ]
  },
  {
    id: "wells_tvp",
    nombre: "Wells TVP",
    area: "Tromboembolismo",
    descripcion: "Probabilidad clinica pretest para trombosis venosa profunda.",
    rango: "-2 a 9",
    puntajeMaximo: 9,
    puntosCorte: [
      { max: 0, texto: "TVP poco probable" },
      { max: 99, texto: "TVP probable; correlacionar y seguir algoritmo diagnostico" }
    ],
    items: [
      { texto: "Cancer activo", opciones: SI_NO },
      { texto: "Paralisis, paresia o inmovilizacion reciente de extremidad", opciones: SI_NO },
      { texto: "Reposo en cama reciente o cirugia mayor", opciones: SI_NO },
      { texto: "Dolor localizado en trayecto venoso profundo", opciones: SI_NO },
      { texto: "Edema de toda la pierna", opciones: SI_NO },
      { texto: "Pantorrilla >3 cm comparada", opciones: SI_NO },
      { texto: "Edema con godete", opciones: SI_NO },
      { texto: "Venas colaterales superficiales", opciones: SI_NO },
      { texto: "TVP previa", opciones: SI_NO },
      { texto: "Diagnostico alternativo al menos tan probable", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: -2 }] }
    ]
  },
  {
    id: "wells_tep",
    nombre: "Wells TEP",
    area: "Tromboembolismo",
    descripcion: "Probabilidad clinica pretest para embolia pulmonar.",
    rango: "0-12.5",
    puntajeMaximo: 12.5,
    puntosCorte: [
      { max: 4, texto: "TEP poco probable" },
      { max: 99, texto: "TEP probable; correlacionar y seguir algoritmo diagnostico" }
    ],
    items: [
      { texto: "Signos clinicos de TVP", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: 3 }] },
      { texto: "TEP es el diagnostico mas probable", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: 3 }] },
      { texto: "FC >100 lpm", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: 1.5 }] },
      { texto: "Inmovilizacion/cirugia reciente", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: 1.5 }] },
      { texto: "TVP/TEP previo", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: 1.5 }] },
      { texto: "Hemoptisis", opciones: SI_NO },
      { texto: "Cancer activo", opciones: SI_NO }
    ]
  },
  {
    id: "perc",
    nombre: "PERC",
    area: "Tromboembolismo",
    descripcion: "Criterios para descartar TEP en pacientes de muy bajo riesgo clinico.",
    rango: "0-8",
    puntajeMaximo: 8,
    puntosCorte: [
      { max: 0, texto: "PERC negativo si el pretest es bajo" },
      { max: 8, texto: "PERC positivo; no descarta TEP" }
    ],
    items: [
      { texto: "Edad >=50 años", opciones: SI_NO },
      { texto: "FC >=100 lpm", opciones: SI_NO },
      { texto: "SatO2 <95%", opciones: SI_NO },
      { texto: "Hemoptisis", opciones: SI_NO },
      { texto: "Uso de estrogenos", opciones: SI_NO },
      { texto: "Cirugia/trauma reciente", opciones: SI_NO },
      { texto: "TVP/TEP previo", opciones: SI_NO },
      { texto: "Edema unilateral de pierna", opciones: SI_NO }
    ]
  },
  {
    id: "cha2ds2vasc",
    nombre: "CHA2DS2-VASc",
    area: "Cardiologia",
    descripcion: "Estimacion de riesgo tromboembolico en fibrilacion auricular no valvular.",
    rango: "0-9",
    puntajeMaximo: 9,
    puntosCorte: [
      { max: 0, texto: "Riesgo bajo" },
      { max: 1, texto: "Riesgo intermedio segun sexo/contexto" },
      { max: 9, texto: "Riesgo elevado; valorar anticoagulacion segun guias" }
    ],
    items: [
      { texto: "Insuficiencia cardiaca", opciones: SI_NO },
      { texto: "Hipertension", opciones: SI_NO },
      { texto: "Edad >=75 años", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: 2 }] },
      { texto: "Diabetes mellitus", opciones: SI_NO },
      { texto: "EVC/AIT/tromboembolismo previo", opciones: [{ texto: "No", valor: 0 }, { texto: "Si", valor: 2 }] },
      { texto: "Enfermedad vascular", opciones: SI_NO },
      { texto: "Edad 65-74 años", opciones: SI_NO },
      { texto: "Sexo femenino", opciones: SI_NO }
    ]
  },
  {
    id: "hasbled",
    nombre: "HAS-BLED",
    area: "Cardiologia",
    descripcion: "Estimacion de riesgo de sangrado en pacientes anticoagulados.",
    rango: "0-9",
    puntajeMaximo: 9,
    puntosCorte: [
      { max: 2, texto: "Riesgo bajo-moderado" },
      { max: 9, texto: "Riesgo alto; corregir factores modificables y vigilar" }
    ],
    items: [
      { texto: "Hipertension no controlada", opciones: SI_NO },
      { texto: "Funcion renal anormal", opciones: SI_NO },
      { texto: "Funcion hepatica anormal", opciones: SI_NO },
      { texto: "EVC previo", opciones: SI_NO },
      { texto: "Sangrado previo o predisposicion", opciones: SI_NO },
      { texto: "INR labil", opciones: SI_NO },
      { texto: "Edad >65 años", opciones: SI_NO },
      { texto: "Farmacos que predisponen a sangrado", opciones: SI_NO },
      { texto: "Alcohol", opciones: SI_NO }
    ]
  },
  {
    id: "stopbang",
    nombre: "STOP-Bang",
    area: "Sueno",
    descripcion: "Tamizaje de riesgo de apnea obstructiva del sueno.",
    rango: "0-8",
    puntajeMaximo: 8,
    puntosCorte: [
      { max: 2, texto: "Riesgo bajo" },
      { max: 4, texto: "Riesgo intermedio" },
      { max: 8, texto: "Riesgo alto" }
    ],
    items: [
      { texto: "Ronquido fuerte", opciones: SI_NO },
      { texto: "Cansancio/somnolencia diurna", opciones: SI_NO },
      { texto: "Apneas observadas", opciones: SI_NO },
      { texto: "Hipertension", opciones: SI_NO },
      { texto: "IMC >35", opciones: SI_NO },
      { texto: "Edad >50 años", opciones: SI_NO },
      { texto: "Circunferencia cuello elevada", opciones: SI_NO },
      { texto: "Sexo masculino", opciones: SI_NO }
    ]
  },
  {
    id: "epworth",
    nombre: "Epworth",
    area: "Sueno",
    descripcion: "Somnolencia diurna en situaciones cotidianas.",
    rango: "0-24",
    puntajeMaximo: 24,
    opciones: ["Nunca", "Ligera probabilidad", "Moderada probabilidad", "Alta probabilidad"],
    valores: [0, 1, 2, 3],
    puntosCorte: [
      { max: 10, texto: "Somnolencia normal o leve" },
      { max: 15, texto: "Somnolencia excesiva moderada" },
      { max: 24, texto: "Somnolencia excesiva severa" }
    ],
    items: [
      "Sentado y leyendo.",
      "Viendo television.",
      "Sentado inactivo en lugar publico.",
      "Como pasajero en auto por una hora.",
      "Acostado por la tarde.",
      "Sentado conversando.",
      "Sentado despues de comer sin alcohol.",
      "En auto detenido por trafico."
    ]
  },
  {
    id: "mmrc",
    nombre: "mMRC",
    area: "Disnea",
    descripcion: "Grado funcional de disnea.",
    rango: "0-4",
    puntajeMaximo: 4,
    puntosCorte: [
      { max: 1, texto: "Disnea leve" },
      { max: 2, texto: "Disnea moderada" },
      { max: 4, texto: "Disnea severa" }
    ],
    items: [
      { texto: "Grado mMRC", opciones: [{ texto: "0 Solo con ejercicio intenso", valor: 0 }, { texto: "1 Al caminar rapido o subir pendiente", valor: 1 }, { texto: "2 Camina mas lento que pares", valor: 2 }, { texto: "3 Se detiene tras pocos minutos", valor: 3 }, { texto: "4 Disnea al vestirse o salir de casa", valor: 4 }] }
    ]
  },
  {
    id: "cat_epoc",
    nombre: "CAT",
    area: "EPOC",
    subtitulo: "COPD Assessment Test",
    descripcion: "Impacto de EPOC en calidad de vida. Captura clinica orientativa.",
    rango: "0-40",
    puntajeMaximo: 40,
    opciones: ["0", "1", "2", "3", "4", "5"],
    valores: [0, 1, 2, 3, 4, 5],
    puntosCorte: [
      { max: 10, texto: "Impacto bajo" },
      { max: 20, texto: "Impacto medio" },
      { max: 30, texto: "Impacto alto" },
      { max: 40, texto: "Impacto muy alto" }
    ],
    items: [
      "Tos.",
      "Flemas.",
      "Opresion toracica.",
      "Disnea al subir pendiente/escaleras.",
      "Limitacion en actividades del hogar.",
      "Confianza para salir de casa.",
      "Sueno.",
      "Energia."
    ]
  },
  {
    id: "nyha",
    nombre: "NYHA",
    area: "Cardiologia",
    descripcion: "Clase funcional en insuficiencia cardiaca.",
    rango: "I-IV",
    puntajeMaximo: 4,
    puntosCorte: [
      { max: 1, texto: "Clase I" },
      { max: 2, texto: "Clase II" },
      { max: 3, texto: "Clase III" },
      { max: 4, texto: "Clase IV" }
    ],
    items: [
      { texto: "Clase funcional", opciones: [{ texto: "I: sin limitacion", valor: 1 }, { texto: "II: limitacion ligera", valor: 2 }, { texto: "III: limitacion marcada", valor: 3 }, { texto: "IV: sintomas en reposo", valor: 4 }] }
    ]
  },
  {
    id: "ecog",
    nombre: "ECOG",
    area: "Funcionalidad",
    descripcion: "Estado funcional en pacientes oncologicos o con enfermedad sistemica.",
    rango: "0-5",
    puntajeMaximo: 5,
    puntosCorte: [
      { max: 1, texto: "Funcionalidad conservada" },
      { max: 2, texto: "Limitacion ambulatoria" },
      { max: 4, texto: "Limitacion severa" },
      { max: 5, texto: "Defuncion" }
    ],
    items: [
      { texto: "Estado ECOG", opciones: [{ texto: "0 Actividad normal", valor: 0 }, { texto: "1 Restriccion en actividad intensa", valor: 1 }, { texto: "2 Ambulatorio, autocuidado, <50% cama", valor: 2 }, { texto: "3 Autocuidado limitado, >50% cama/silla", valor: 3 }, { texto: "4 Completamente incapacitado", valor: 4 }, { texto: "5 Defuncion", valor: 5 }] }
    ]
  },
  {
    id: "sofa_simplificado",
    nombre: "SOFA",
    area: "Medicina critica",
    descripcion: "Captura por dominios de disfuncion organica. Requiere datos de laboratorio y gasometria cuando aplique.",
    rango: "0-24",
    puntajeMaximo: 24,
    puntosCorte: [
      { max: 1, texto: "Sin incremento relevante por SOFA" },
      { max: 5, texto: "Disfuncion organica leve-moderada" },
      { max: 24, texto: "Disfuncion organica importante; requiere manejo especializado" }
    ],
    items: [
      { texto: "Respiratorio", tipo: "numero", min: 0, max: 4, step: 1, ayuda: "Puntaje SOFA respiratorio 0-4" },
      { texto: "Coagulacion", tipo: "numero", min: 0, max: 4, step: 1 },
      { texto: "Hepatico", tipo: "numero", min: 0, max: 4, step: 1 },
      { texto: "Cardiovascular", tipo: "numero", min: 0, max: 4, step: 1 },
      { texto: "Neurologico", tipo: "numero", min: 0, max: 4, step: 1 },
      { texto: "Renal", tipo: "numero", min: 0, max: 4, step: 1 }
    ]
  }
];

export const ESCALAS_PEDIATRICAS_NOTA = [
  {
    id: "apgar",
    nombre: "APGAR",
    area: "Pediatria",
    descripcion: "Valoracion neonatal inmediata. Usar en el contexto del minuto de vida correspondiente.",
    rango: "0-10",
    puntajeMaximo: 10,
    puntosCorte: [
      { max: 3, texto: "Depresion severa" },
      { max: 6, texto: "Depresion moderada" },
      { max: 10, texto: "Adaptacion adecuada o leve compromiso segun contexto" }
    ],
    items: [
      { texto: "Apariencia/color", opciones: [{ texto: "Azul/palido", valor: 0 }, { texto: "Acrociañosis", valor: 1 }, { texto: "Rosado", valor: 2 }] },
      { texto: "Pulso", opciones: [{ texto: "Ausente", valor: 0 }, { texto: "<100", valor: 1 }, { texto: ">=100", valor: 2 }] },
      { texto: "Gesticulacion/reflejos", opciones: [{ texto: "Sin respuesta", valor: 0 }, { texto: "Mueca", valor: 1 }, { texto: "Llanto/tos/estornudo", valor: 2 }] },
      { texto: "Actividad/tono", opciones: [{ texto: "Flacido", valor: 0 }, { texto: "Flexion leve", valor: 1 }, { texto: "Activo", valor: 2 }] },
      { texto: "Respiracion", opciones: [{ texto: "Ausente", valor: 0 }, { texto: "Lenta/irregular", valor: 1 }, { texto: "Llanto vigoroso", valor: 2 }] }
    ]
  },
  {
    id: "silverman_andersen",
    nombre: "Silverman-Andersen",
    area: "Pediatria",
    descripcion: "Valoracion de dificultad respiratoria neonatal. Mayor puntaje indica mayor dificultad.",
    rango: "0-10",
    puntajeMaximo: 10,
    puntosCorte: [
      { max: 3, texto: "Dificultad respiratoria leve" },
      { max: 6, texto: "Dificultad respiratoria moderada" },
      { max: 10, texto: "Dificultad respiratoria severa" }
    ],
    items: [
      { texto: "Movimientos toracoabdominales", opciones: [{ texto: "Sincronos", valor: 0 }, { texto: "Retardo leve", valor: 1 }, { texto: "Disociacion", valor: 2 }] },
      { texto: "Tiraje intercostal", opciones: [{ texto: "Ausente", valor: 0 }, { texto: "Leve", valor: 1 }, { texto: "Marcado", valor: 2 }] },
      { texto: "Retraccion xifoidea", opciones: [{ texto: "Ausente", valor: 0 }, { texto: "Leve", valor: 1 }, { texto: "Marcada", valor: 2 }] },
      { texto: "Aleteo nasal", opciones: [{ texto: "Ausente", valor: 0 }, { texto: "Leve", valor: 1 }, { texto: "Marcado", valor: 2 }] },
      { texto: "Quejido espiratorio", opciones: [{ texto: "Ausente", valor: 0 }, { texto: "Audible con estetoscopio", valor: 1 }, { texto: "Audible sin estetoscopio", valor: 2 }] }
    ]
  },
  {
    id: "downes",
    nombre: "Downes",
    area: "Pediatria",
    descripcion: "Valoracion clinica de dificultad respiratoria en pediatria/neonatologia.",
    rango: "0-10",
    puntajeMaximo: 10,
    puntosCorte: [
      { max: 3, texto: "Dificultad leve" },
      { max: 6, texto: "Dificultad moderada" },
      { max: 10, texto: "Dificultad severa" }
    ],
    items: [
      { texto: "Frecuencia respiratoria", opciones: [{ texto: "<60", valor: 0 }, { texto: "60-80", valor: 1 }, { texto: ">80 o apnea", valor: 2 }] },
      { texto: "Ciañosis", opciones: [{ texto: "Ausente", valor: 0 }, { texto: "Con aire ambiente", valor: 1 }, { texto: "Con oxigeno", valor: 2 }] },
      { texto: "Entrada de aire", opciones: [{ texto: "Buena", valor: 0 }, { texto: "Disminuida", valor: 1 }, { texto: "Muy disminuida", valor: 2 }] },
      { texto: "Quejido", opciones: [{ texto: "Ausente", valor: 0 }, { texto: "Audible con estetoscopio", valor: 1 }, { texto: "Audible sin estetoscopio", valor: 2 }] },
      { texto: "Retracciones", opciones: [{ texto: "Ausentes", valor: 0 }, { texto: "Moderadas", valor: 1 }, { texto: "Severas", valor: 2 }] }
    ]
  },
  {
    id: "glasgow_pediatrico",
    nombre: "Glasgow pediatrico",
    area: "Pediatria",
    descripcion: "Adaptacion pediatrica de Glasgow; elegir respuestas acordes a edad/desarrollo.",
    rango: "3-15",
    puntajeMaximo: 15,
    puntosCorte: [
      { max: 8, texto: "Compromiso severo" },
      { max: 12, texto: "Compromiso moderado" },
      { max: 15, texto: "Compromiso leve o normal segun contexto" }
    ],
    items: [
      { texto: "Apertura ocular", opciones: [{ texto: "Ninguna", valor: 1 }, { texto: "Al dolor", valor: 2 }, { texto: "A la voz", valor: 3 }, { texto: "Espontanea", valor: 4 }] },
      { texto: "Respuesta verbal pediatrica", opciones: [{ texto: "Ninguna", valor: 1 }, { texto: "Inconsolable/incomprensible", valor: 2 }, { texto: "Llanto persistente/palabras inapropiadas", valor: 3 }, { texto: "Irritable/confusa", valor: 4 }, { texto: "Sonrie/orientada/interactua", valor: 5 }] },
      { texto: "Respuesta motora", opciones: [{ texto: "Ninguna", valor: 1 }, { texto: "Extension", valor: 2 }, { texto: "Flexion anormal", valor: 3 }, { texto: "Retirada", valor: 4 }, { texto: "Localiza dolor", valor: 5 }, { texto: "Obedece ordenes/movimiento espontaneo", valor: 6 }] }
    ]
  },
  {
    id: "flacc",
    nombre: "FLACC",
    area: "Pediatria",
    descripcion: "Escala observacional de dolor en lactantes y ninos pequenos.",
    rango: "0-10",
    puntajeMaximo: 10,
    puntosCorte: [
      { max: 0, texto: "Sin dolor observado" },
      { max: 3, texto: "Dolor leve" },
      { max: 6, texto: "Dolor moderado" },
      { max: 10, texto: "Dolor severo" }
    ],
    items: [
      { texto: "Cara", opciones: [{ texto: "Relajada", valor: 0 }, { texto: "Mueca ocasional", valor: 1 }, { texto: "Mandibula tensa/temblor", valor: 2 }] },
      { texto: "Piernas", opciones: [{ texto: "Relajadas", valor: 0 }, { texto: "Inquietas/tensas", valor: 1 }, { texto: "Pataleo/flexion marcada", valor: 2 }] },
      { texto: "Actividad", opciones: [{ texto: "Tranquila", valor: 0 }, { texto: "Se retuerce/cambia posicion", valor: 1 }, { texto: "Arqueado/rigido/sacudidas", valor: 2 }] },
      { texto: "Llanto", opciones: [{ texto: "Sin llanto", valor: 0 }, { texto: "Gemidos/quejas", valor: 1 }, { texto: "Llanto sostenido/gritos", valor: 2 }] },
      { texto: "Consolabilidad", opciones: [{ texto: "Contento/relajado", valor: 0 }, { texto: "Se tranquiliza con contacto", valor: 1 }, { texto: "Dificil de consolar", valor: 2 }] }
    ]
  },
  {
    id: "pews",
    nombre: "PEWS",
    area: "Pediatria",
    descripcion: "Alerta temprana pediatrica. Use el protocolo institucional y rangos por edad.",
    rango: "0-9",
    puntajeMaximo: 9,
    puntosCorte: [
      { max: 2, texto: "Riesgo bajo" },
      { max: 4, texto: "Riesgo moderado; vigilancia" },
      { max: 9, texto: "Riesgo alto; valorar escalamiento" }
    ],
    items: [
      { texto: "Comportamiento/neurologico", opciones: [{ texto: "Normal", valor: 0 }, { texto: "Irritable/somnoliento", valor: 1 }, { texto: "Letargico/confuso", valor: 2 }, { texto: "Respuesta muy disminuida", valor: 3 }] },
      { texto: "Cardiovascular", opciones: [{ texto: "Normal", valor: 0 }, { texto: "Palidez leve/taquicardia leve", valor: 1 }, { texto: "Taquicardia marcada/llenado capilar lento", valor: 2 }, { texto: "Hipotension/mala perfusion", valor: 3 }] },
      { texto: "Respiratorio", opciones: [{ texto: "Normal", valor: 0 }, { texto: "Taquipnea leve", valor: 1 }, { texto: "Trabajo respiratorio moderado", valor: 2 }, { texto: "Trabajo severo/oxigeno alto", valor: 3 }] }
    ],
    consideraciones: ["La puntuacion debe adaptarse a tablas por edad y protocolo local."]
  },
  {
    id: "deshidratacion_pediatrica",
    nombre: "Deshidratacion pediatrica",
    area: "Pediatria",
    descripcion: "Estimacion clinica orientativa de deshidratacion en pediatria.",
    rango: "0-8",
    puntajeMaximo: 8,
    puntosCorte: [
      { max: 1, texto: "Sin deshidratacion o minima" },
      { max: 4, texto: "Deshidratacion leve-moderada" },
      { max: 8, texto: "Deshidratacion importante; valorar manejo urgente" }
    ],
    items: [
      { texto: "Estado general", opciones: [{ texto: "Normal", valor: 0 }, { texto: "Sediento/inquieto", valor: 1 }, { texto: "Letargico", valor: 2 }] },
      { texto: "Ojos", opciones: [{ texto: "Normales", valor: 0 }, { texto: "Hundidos", valor: 1 }, { texto: "Muy hundidos", valor: 2 }] },
      { texto: "Mucosas/lagrimas", opciones: [{ texto: "Humedas/lagrimas", valor: 0 }, { texto: "Secas/pocas lagrimas", valor: 1 }, { texto: "Muy secas/sin lagrimas", valor: 2 }] },
      { texto: "Llenado capilar/turgor", opciones: [{ texto: "Normal", valor: 0 }, { texto: "Lento", valor: 1 }, { texto: "Muy lento/pliegue persistente", valor: 2 }] }
    ]
  },
  {
    id: "pram_asma",
    nombre: "PRAM",
    area: "Pediatria",
    subtitulo: "Pediatric Respiratory Assessment Measure",
    descripcion: "Gravedad de exacerbacion asmatica pediatrica.",
    rango: "0-12",
    puntajeMaximo: 12,
    puntosCorte: [
      { max: 3, texto: "Exacerbacion leve" },
      { max: 7, texto: "Exacerbacion moderada" },
      { max: 12, texto: "Exacerbacion severa" }
    ],
    items: [
      { texto: "Retraccion suprasternal", opciones: [{ texto: "Ausente", valor: 0 }, { texto: "Presente", valor: 2 }] },
      { texto: "Contraccion de escalenos", opciones: [{ texto: "Ausente", valor: 0 }, { texto: "Presente", valor: 2 }] },
      { texto: "Entrada de aire", opciones: [{ texto: "Normal", valor: 0 }, { texto: "Disminuida bases", valor: 1 }, { texto: "Disminuida difusa", valor: 2 }, { texto: "Minima/ausente", valor: 3 }] },
      { texto: "Sibilancias", opciones: [{ texto: "Ausentes", valor: 0 }, { texto: "Espiratorias", valor: 1 }, { texto: "Inspiratorias y espiratorias", valor: 2 }, { texto: "Audibles sin estetoscopio o silencio", valor: 3 }] },
      { texto: "Saturacion O2", opciones: [{ texto: ">=95%", valor: 0 }, { texto: "92-94%", valor: 1 }, { texto: "<92%", valor: 2 }] }
    ]
  }
];
