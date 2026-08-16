const SI_NO = [{ texto: "No", valor: 0 }, { texto: "Sí", valor: 1 }];
const cortes = (puntos) => (puntaje) => puntos.find((punto) => puntaje <= punto.max)?.texto || "Sin interpretación";
const modoris = (puntaje, respuestas = []) => {
  const v = respuestas.map((r) => Number(r.valor || 0)); const si = (i) => v[i] === 1;
  if (si(4) && (si(0) || si(1) || si(2))) return "Riesgo inminente (4.º orden): activar protocolo de emergencia.";
  if (si(3)) return "Riesgo alto (3.º orden): valoración clínica especializada prioritaria.";
  if (si(0) && si(1) && si(2)) return "Riesgo moderado (2.º orden): valoración clínica y seguimiento.";
  if (si(0) && si(1)) return "Riesgo bajo (1.º orden): continuar evaluación clínica y medidas de seguridad.";
  return "Sin riesgo identificado por este tamizaje; mantener vigilancia según contexto.";
};
const items = (textos, opciones = SI_NO) => textos.map((texto) => ({ texto, opciones }));
const modorisItems = items(["¿Ha deseado estar muerto(a) o quedarse dormido(a) y no despertar?", "¿Ha tenido pensamientos de suicidio?", "¿Ha planeado cómo suicidarse?", "¿Ha intentado suicidarse alguna vez?", "¿Está pensando en suicidarse en este momento?"]);
const mcleanItems = items(["¿Sus relaciones más cercanas han tenido muchos problemas o rupturas repetidas?", "¿Se ha lastimado deliberadamente o ha hecho un intento de suicidio?", "¿Ha tenido al menos dos problemas de impulsividad?", "¿Ha tenido cambios de ánimo extremos?", "¿Se ha enojado mucho o actuado con enojo o sarcasmo con frecuencia?", "¿Ha desconfiado con frecuencia de otras personas?", "¿Se ha sentido irreal o como si el mundo no fuera real?", "¿Se ha sentido vacío(a) crónicamente?", "¿Ha sentido que no sabe quién es o que no tiene identidad?", "¿Ha hecho esfuerzos desesperados para evitar ser abandonado(a)?"]);
const beckItems = items(["Tristeza", "Pesimismo", "Fracaso previo", "Pérdida de placer", "Sentimientos de culpa", "Sentimientos de castigo", "Disconformidad con uno mismo", "Autocrítica", "Pensamientos o deseos suicidas", "Llanto", "Agitación", "Pérdida de interés", "Indecisión", "Inutilidad", "Pérdida de energía", "Cambios en el patrón de sueño", "Irritabilidad", "Cambios en el apetito", "Dificultad de concentración", "Cansancio o fatiga", "Pérdida de interés en el sexo"], null).map((item) => ({ ...item, tipo: "numero", min: 0, max: 3, ayuda: "Capture 0–3 conforme al formulario BDI-II autorizado." }));
const gdsItems = items(["¿Está satisfecho(a) con su vida?", "¿Ha abandonado muchas actividades e intereses?", "¿Siente que su vida está vacía?", "¿Se aburre con frecuencia?", "¿Está de buen ánimo la mayor parte del tiempo?", "¿Teme que algo malo vaya a sucederle?", "¿Se siente feliz la mayor parte del tiempo?", "¿Se siente desamparado(a)?", "¿Prefiere quedarse en casa?", "¿Tiene más problemas de memoria que otras personas?", "¿Piensa que es maravilloso estar vivo(a)?", "¿Se siente inútil?", "¿Se siente lleno(a) de energía?", "¿Siente que su situación es desesperada?", "¿Cree que la mayoría está mejor que usted?"]);
gdsItems.forEach((item, index) => { const sumaConSi = [1, 2, 3, 5, 7, 8, 9, 11, 13, 14].includes(index); item.opciones = [{ texto: "No", valor: sumaConSi ? 0 : 1 }, { texto: "Sí", valor: sumaConSi ? 1 : 0 }]; });
const katzItems = items(["Baño: ¿se baña sin ayuda?", "Vestido: ¿se viste sin ayuda?", "Uso del sanitario: ¿lo usa sin ayuda?", "Traslado: ¿se levanta y se mueve sin ayuda?", "Continencia: ¿controla esfínteres?", "Alimentación: ¿come sin ayuda?"], [{ texto: "Dependiente", valor: 0 }, { texto: "Independiente", valor: 1 }]);
const frecuenciaCinco = ["Nunca", "Rara vez", "A veces", "Frecuentemente", "Muy frecuentemente"];
const frecuenciaSeisEat = ["Nunca", "Rara vez", "A veces", "A menudo", "Casi siempre", "Siempre"];
const ybocsItems = [
  "Tiempo ocupado por obsesiones.", "Interferencia de las obsesiones.", "Malestar asociado con las obsesiones.",
  "Resistencia ante las obsesiones.", "Control sobre las obsesiones.", "Tiempo ocupado por compulsiones.",
  "Interferencia de las compulsiones.", "Malestar asociado con las compulsiones.", "Resistencia ante las compulsiones.",
  "Control sobre las compulsiones."
].map((texto, index) => ({ texto, dominio: index < 5 ? "Obsesiones" : "Compulsiones", opciones: [0, 1, 2, 3, 4].map((valor) => ({ texto: String(valor), valor })) }));
const asrsV11Items = [
  "Dificultad para terminar los detalles finales de una tarea.", "Dificultad para ordenar tareas que requieren organizacion.",
  "Problemas para recordar citas u obligaciones.", "Evita o retrasa tareas que requieren esfuerzo mental sostenido.",
  "Mueve manos o pies, o se inquieta al permanecer sentado.", "Se siente impulsado por un motor o con actividad excesiva.",
  "Comete errores por descuido cuando trabaja en una tarea tediosa.", "Dificultad para mantener la atencion en tareas repetitivas.",
  "Dificultad para concentrarse en lo que otras personas dicen.", "Pierde o extravia objetos necesarios para sus actividades.",
  "Se distrae por actividad o ruido alrededor.", "Se levanta en situaciones en que deberia permanecer sentado.",
  "Se siente inquieto o intranquilo.", "Dificultad para relajarse cuando dispone de tiempo libre.",
  "Habla demasiado en situaciones sociales.", "Termina frases de otras personas antes de que concluyan.",
  "Dificultad para esperar su turno.", "Interrumpe o se entromete en las actividades de otras personas."
].map((texto, index) => ({ texto, dominio: index < 6 ? "Parte A" : "Parte B", opciones: frecuenciaCinco.map((textoOpcion, valor) => ({ texto: textoOpcion, valor })) }));
const eat26Items = [
  "Me preocupa estar mas delgado o adelgazar.", "Evito comer cuando tengo hambre.", "Me descubro pensando en la comida.",
  "He tenido episodios de comer sin poder detenerme.", "Corto la comida en trozos pequenos.", "Conozco las calorias de los alimentos que como.",
  "Evito alimentos con muchos carbohidratos.", "Siento que otras personas preferirian que comiera mas.", "Vomito despues de comer.",
  "Me siento culpable despues de comer.", "Me preocupa querer estar mas delgado.", "Pienso en quemar calorias cuando hago ejercicio.",
  "Otras personas piensan que estoy demasiado delgado.", "Me preocupa tener grasa en el cuerpo.", "Tardo mas que otras personas en comer.",
  "Evito alimentos con azucar.", "Como alimentos de dieta.", "Siento que la comida controla mi vida.",
  "Muestro autocontrol alrededor de la comida.", "Siento que otras personas me presionan para comer.",
  "Paso demasiado tiempo pensando en la comida.", "Me siento incomodo despues de comer dulces.",
  "Me comprometo con dietas.", "Me gusta sentir el estomago vacio.", "Disfruto probar alimentos nuevos y abundantes.",
  "Despues de comer siento deseos de vomitar."
].map((texto, index) => ({ texto, dominio: [0, 5, 6, 9, 10, 11, 13, 15, 16, 19, 22, 23].includes(index) ? "Restriccion dietetica" : [2, 3, 8, 17, 20, 21, 25].includes(index) ? "Bulimia y preocupacion por la comida" : "Control oral", opciones: frecuenciaSeisEat.map((textoOpcion, valor) => ({ texto: textoOpcion, valor })) }));
const base = { puntosCorte: [] };
export const ESCALAS_SOLICITADAS = [
  { ...base, id: "asq-modoris", nombre: "ASQ MODORIS", area: "Riesgo suicida", tipoEscala: "psiquiatrica", subtitulo: "Tamizaje del riesgo suicida", descripcion: "Cinco preguntas; no sustituye una evaluación de riesgo suicida.", rango: "0-5", puntajeMaximo: 5, items: modorisItems, dominiosEvaluados: ["Ideación", "Plan", "Intento", "Agudeza"], interpretarPuntaje: modoris },
  { ...base, id: "msi-mclean", nombre: "McLean (MSI-BPD)", area: "Personalidad", tipoEscala: "psiquiatrica", subtitulo: "Screening Instrument for BPD", descripcion: "Cribado de 10 reactivos sí/no; un resultado positivo requiere evaluación adicional.", rango: "0-10", puntajeMaximo: 10, items: mcleanItems, puntosCorte: [{ max: 6, texto: "Menor al punto de corte habitual" }, { max: 10, texto: "Punto de corte alcanzado (≥7): requiere evaluación adicional" }] },
  { ...base, id: "beck-bdi-ii", nombre: "Beck (BDI-II)", area: "Depresión", tipoEscala: "psiquiatrica", subtitulo: "Inventario de Depresión de Beck-II", descripcion: "Registra los 21 dominios con puntajes 0–3. La aplicación formal requiere el formulario autorizado; no reproduce sus afirmaciones propietarias.", rango: "0-63", puntajeMaximo: 63, items: beckItems, puntosCorte: [{ max: 13, texto: "Mínima" }, { max: 19, texto: "Leve" }, { max: 28, texto: "Moderada" }, { max: 63, texto: "Severa" }] },
  { ...base, id: "gds-15", nombre: "Escala de Depresión Geriátrica (GDS-15)", area: "Geriatría", tipoEscala: "medicina_general", subtitulo: "Versión corta", descripcion: "Tamizaje de síntomas depresivos en personas mayores.", rango: "0-15", puntajeMaximo: 15, items: gdsItems, puntosCorte: [{ max: 4, texto: "Sin indicios relevantes" }, { max: 8, texto: "Posible depresión" }, { max: 15, texto: "Probable depresión: valorar clínicamente" }] },
  { ...base, id: "katz-adl", nombre: "Índice de Katz", area: "Funcionalidad", tipoEscala: "medicina_general", subtitulo: "Actividades básicas de la vida diaria", descripcion: "Evalúa independencia en seis actividades básicas.", rango: "0-6", puntajeMaximo: 6, items: katzItems, puntosCorte: [{ max: 1, texto: "Dependencia severa" }, { max: 3, texto: "Dependencia moderada" }, { max: 5, texto: "Dependencia leve" }, { max: 6, texto: "Independencia" }] }
];

export const ESCALAS_COMPLETAS_ADICIONALES = [
  { ...base, id: "yale-brown", nombre: "Yale-Brown (Y-BOCS)", area: "Trastorno obsesivo-compulsivo", tipoEscala: "psiquiatrica", subtitulo: "Version completa de 10 reactivos", descripcion: "Valoracion estructurada de obsesiones y compulsiones.", rango: "0-40", puntajeMaximo: 40, opciones: ["0", "1", "2", "3", "4"], valores: [0, 1, 2, 3, 4], items: ybocsItems, puntosCorte: [{ max: 7, texto: "Subclinico o minimo" }, { max: 15, texto: "Leve" }, { max: 23, texto: "Moderado" }, { max: 31, texto: "Severo" }, { max: 40, texto: "Extremo" }] },
  { ...base, id: "asrd-v1", nombre: "ASRD v1 / ASRS v1.1", area: "TDAH adulto", tipoEscala: "psiquiatrica", subtitulo: "Version completa de 18 reactivos", descripcion: "Tamizaje de sintomas de TDAH en adultos. Requiere integracion clinica.", rango: "0-72", puntajeMaximo: 72, aliases: ["asrd v1", "asrs v1.1", "adult adhd self-report scale"], opciones: frecuenciaCinco, valores: [0, 1, 2, 3, 4], items: asrsV11Items, puntosCorte: [{ max: 23, texto: "Baja puntuacion; interpretar clinicamente" }, { max: 47, texto: "Puntuacion intermedia; valorar evaluacion adicional" }, { max: 72, texto: "Puntuacion elevada; valorar evaluacion diagnostica" }] },
  { ...base, id: "eat-26", nombre: "EAT-26", area: "Conducta alimentaria", tipoEscala: "psiquiatrica", subtitulo: "Eating Attitudes Test de 26 reactivos", descripcion: "Tamizaje de actitudes y conductas alimentarias; no establece diagnostico por si solo.", rango: "0-78", puntajeMaximo: 78, opciones: frecuenciaSeisEat, valores: [0, 1, 2, 3, 4, 5], scoring: "eat26", items: eat26Items, puntosCorte: [{ max: 19, texto: "Por debajo del punto de corte de tamizaje" }, { max: 78, texto: "Punto de corte alcanzado; requiere evaluacion clinica" }] }
];
