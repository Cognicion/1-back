/**
 * Matriz regulatoria de interacciones de los ISRS del catalogo oficial.
 * Las reglas se declaran una sola vez; el catalogo genera referencias
 * reciprocas para ambos medicamentos sin duplicar la fuente clinica.
 */

export const ISRS_CATALOG_IDS = Object.freeze([
  "sertralina",
  "fluoxetina",
  "paroxetina",
  "citalopram",
  "escitalopram",
  "fluvoxamina"
]);
export const FUENTES_REGULATORIAS_ISRS = Object.freeze({
  sertralina: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fda754f6-d0f3-4dce-a17a-927d64f912f7",
  fluoxetina: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c88f33ed-6dfb-4c5e-bc01-d8e36dd97299",
  paroxetina: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ef3b5cbe-f9e1-c1ac-79da-cfe14e3a7e7e",
  citalopram: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4259d9b1-de34-43a4-85a8-41dd214e9177",
  escitalopram: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=13bb8267-1cab-43e5-acae-55a4d957630a",
  fluvoxamina: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0b107225-ed5a-4461-9184-f3f2bad1892f"
});

const TODAS_LAS_FUENTES = Object.freeze(Object.values(FUENTES_REGULATORIAS_ISRS));
const FUENTES_CYP2D6 = Object.freeze([
  FUENTES_REGULATORIAS_ISRS.fluoxetina,
  FUENTES_REGULATORIAS_ISRS.paroxetina,
  FUENTES_REGULATORIAS_ISRS.sertralina,
  FUENTES_REGULATORIAS_ISRS.escitalopram
]);

function regla(datos) {
  return Object.freeze({
    evidencia: "ficha_tecnica_regulatoria",
    confianza: "alta",
    tipoInteraccion: "farmacodinamica",
    categoria: "otra",
    fuentes: TODAS_LAS_FUENTES,
    ...datos
  });
}

export const REGLAS_INTERACCIONES_ISRS = Object.freeze([
  regla({
    id: "isrs_imao_contraindicado_regulatorio",
    clasesA: ["isrs"], clasesB: ["imao", "imao_reversible"], severidad: "critica",
    titulo: "ISRS + inhibidor de la monoaminooxidasa",
    mecanismo: "La inhibicion de la recaptura de serotonina y de su metabolismo puede producir una elevacion serotoninergica peligrosa.",
    efecto: "Riesgo de sindrome serotoninergico grave o potencialmente mortal.",
    recomendacion: "Combinacion contraindicada. Respetar los periodos de lavado de la ficha tecnica; linezolid y azul de metileno intravenoso requieren manejo especializado.",
    categoria: "serotoninergica", tipoInteraccion: "serotoninergica", requiereJustificacion: true
  }),
  regla({
    id: "isrs_azul_metileno_contraindicado",
    clasesA: ["isrs"], ingredientesB: ["azul_metileno"], severidad: "critica",
    titulo: "ISRS + azul de metileno intravenoso",
    mecanismo: "El azul de metileno tiene actividad inhibitoria de MAO y puede aumentar marcadamente la senal serotoninergica.",
    efecto: "Riesgo de sindrome serotoninergico grave.",
    recomendacion: "Evitar la combinacion; si el tratamiento es imprescindible, seguir el protocolo de suspension y vigilancia de la ficha tecnica.",
    categoria: "serotoninergica", tipoInteraccion: "serotoninergica", requiereJustificacion: true
  }),
  regla({
    id: "isrs_serotoninergico_regulatorio",
    clasesA: ["isrs"], clasesB: ["serotoninergico"], severidad: "alta",
    titulo: "ISRS + otro farmaco serotoninergico",
    mecanismo: "Los efectos serotoninergicos se suman.",
    efecto: "Mayor riesgo de agitacion, alteracion autonomica, temblor, clonus, hiperreflexia, fiebre, convulsiones y sindrome serotoninergico.",
    recomendacion: "Evitar duplicidad no indicada; si la combinacion o el cambio cruzado son necesarios, documentar dosis, lavado y vigilancia clinica.",
    categoria: "serotoninergica", tipoInteraccion: "serotoninergica"
  }),
  regla({
    id: "isrs_aine_sangrado_regulatorio",
    clasesA: ["isrs"], clasesB: ["aine"], severidad: "moderada",
    titulo: "ISRS + AINE: riesgo de sangrado",
    mecanismo: "La alteracion de la funcion plaquetaria por el ISRS se suma al dano gastrointestinal y efecto hemostatico del AINE.",
    efecto: "Aumenta el riesgo de sangrado gastrointestinal y otros sangrados.",
    recomendacion: "Revisar necesidad y duracion, antecedentes de sangrado y gastroproteccion; vigilar melena, hematemesis, equimosis y hemoglobina cuando proceda.",
    categoria: "hemorragica"
  }),
  regla({
    id: "isrs_antitrombotico_sangrado_regulatorio",
    clasesA: ["isrs"], clasesB: ["antiagregante", "anticoagulante"], severidad: "moderada",
    titulo: "ISRS + antiagregante o anticoagulante",
    mecanismo: "La inhibicion de la captacion plaquetaria de serotonina se suma al efecto antitrombotico.",
    efecto: "Mayor riesgo de sangrado gastrointestinal, mucoso o mayor.",
    recomendacion: "Confirmar indicacion, vigilar sangrado y biometria segun riesgo; monitorizar INR cuando se use warfarina.",
    categoria: "hemorragica"
  }),
  regla({
    id: "isrs_pimozida_contraindicado",
    ingredientesA: ISRS_CATALOG_IDS, ingredientesB: ["pimozida"], severidad: "critica",
    titulo: "ISRS + pimozida",
    mecanismo: "Puede aumentar la exposicion a pimozida y sumar prolongacion del intervalo QT.",
    efecto: "Riesgo de prolongacion QT, torsades de pointes y arritmia ventricular.",
    recomendacion: "Combinacion contraindicada conforme a las fichas tecnicas revisadas.",
    categoria: "qt", tipoInteraccion: "QT", requiereJustificacion: true
  }),
  regla({
    id: "isrs_tioridazina_contraindicado",
    ingredientesA: ["fluoxetina", "paroxetina", "fluvoxamina"], ingredientesB: ["tioridazina"], severidad: "critica",
    titulo: "ISRS inhibidor enzimatico + tioridazina",
    mecanismo: "La inhibicion metabolica puede elevar tioridazina y aumentar su efecto sobre QT.",
    efecto: "Riesgo de arritmia ventricular grave y muerte subita.",
    recomendacion: "Combinacion contraindicada; con fluoxetina respetar tambien el periodo posterior a la suspension indicado en ficha tecnica.",
    categoria: "qt", tipoInteraccion: "QT", requiereJustificacion: true,
    fuentes: [FUENTES_REGULATORIAS_ISRS.fluoxetina, FUENTES_REGULATORIAS_ISRS.paroxetina, FUENTES_REGULATORIAS_ISRS.fluvoxamina]
  }),
  regla({
    id: "isrs_riesgo_qt_regulatorio",
    ingredientesA: ["citalopram", "escitalopram", "fluoxetina", "sertralina"], clasesB: ["qt"], severidad: "alta",
    titulo: "ISRS + farmaco que prolonga QT",
    mecanismo: "La prolongacion del intervalo QT puede ser aditiva y algunas interacciones metabolicas aumentan la exposicion.",
    efecto: "Mayor riesgo de QT prolongado, torsades de pointes y arritmia ventricular, especialmente con bradicardia o alteraciones electroliticas.",
    recomendacion: "Evitar cuando la ficha tecnica lo indique; revisar ECG, potasio, magnesio, dosis y alternativas segun riesgo individual.",
    categoria: "qt", tipoInteraccion: "QT",
    fuentes: [FUENTES_REGULATORIAS_ISRS.citalopram, FUENTES_REGULATORIAS_ISRS.escitalopram, FUENTES_REGULATORIAS_ISRS.fluoxetina, FUENTES_REGULATORIAS_ISRS.sertralina]
  }),
  regla({
    id: "isrs_cyp2d6_sustrato_regulatorio",
    ingredientesA: ["fluoxetina", "paroxetina", "sertralina", "escitalopram"], clasesB: ["sustrato_cyp2d6"], severidad: "moderada",
    titulo: "ISRS inhibidor de CYP2D6 + sustrato CYP2D6",
    mecanismo: "La inhibicion de CYP2D6 puede aumentar la exposicion del medicamento sustrato; el efecto es especialmente relevante con fluoxetina y paroxetina.",
    efecto: "Puede aumentar reacciones adversas o toxicidad del sustrato y requerir ajuste de dosis.",
    recomendacion: "Revisar margen terapeutico, dosis y respuesta; considerar reduccion y monitorizacion del sustrato cuando corresponda.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: FUENTES_CYP2D6
  }),
  regla({
    id: "fluoxetina_triciclico_niveles",
    ingredientesA: ["fluoxetina"], clasesB: ["triciclico"], severidad: "alta",
    titulo: "Fluoxetina + antidepresivo triciclico",
    mecanismo: "Fluoxetina inhibe CYP2D6 y puede elevar de forma marcada y persistente las concentraciones del triciclico.",
    efecto: "Mayor riesgo anticolinergico, cardiovascular, neurologico y serotoninergico.",
    recomendacion: "Considerar menor dosis del triciclico y monitorizar concentraciones, ECG y toxicidad durante la combinacion y tras suspender fluoxetina.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluoxetina]
  }),
  regla({
    id: "fluoxetina_benzodiacepinas_oxidativas",
    ingredientesA: ["fluoxetina"], ingredientesB: ["alprazolam", "diazepam"], severidad: "moderada",
    titulo: "Fluoxetina + alprazolam o diazepam",
    mecanismo: "Fluoxetina puede aumentar alprazolam y prolongar la vida media de diazepam.",
    efecto: "Mayor sedacion y deterioro psicomotor.",
    recomendacion: "Usar dosis prudentes y vigilar sedacion, coordinacion, caidas y conduccion.",
    categoria: "depresora_snc", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluoxetina]
  }),
  regla({
    id: "fluoxetina_antipsicoticos_niveles",
    ingredientesA: ["fluoxetina"], ingredientesB: ["haloperidol", "clozapina"], severidad: "alta",
    titulo: "Fluoxetina + haloperidol o clozapina",
    mecanismo: "Se han observado elevaciones de las concentraciones del antipsicotico durante la coadministracion.",
    efecto: "Puede aumentar efectos extrapiramidales, sedacion, hipotension, convulsiones u otra toxicidad segun el antipsicotico.",
    recomendacion: "Vigilar respuesta y toxicidad; revisar dosis y concentraciones cuando esten disponibles.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluoxetina]
  }),
  regla({
    id: "fluoxetina_anticonvulsivos_niveles",
    ingredientesA: ["fluoxetina"], ingredientesB: ["fenitoina", "carbamazepina"], severidad: "alta",
    titulo: "Fluoxetina + fenitoina o carbamazepina",
    mecanismo: "Fluoxetina puede elevar las concentraciones del anticonvulsivo.",
    efecto: "Riesgo de toxicidad neurologica y sistemica del anticonvulsivo.",
    recomendacion: "Vigilar sintomas y concentraciones plasmaticas; ajustar el anticonvulsivo si procede.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluoxetina]
  }),
  regla({
    id: "fluoxetina_olanzapina_exposicion",
    ingredientesA: ["fluoxetina"], ingredientesB: ["olanzapina"], severidad: "informativa",
    titulo: "Fluoxetina + olanzapina",
    mecanismo: "Fluoxetina produce un aumento pequeno de la exposicion a olanzapina.",
    efecto: "El cambio suele ser menor que la variabilidad entre pacientes, pero puede sumar efectos adversos.",
    recomendacion: "Vigilar tolerabilidad y consultar la informacion del producto combinado cuando corresponda.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluoxetina]
  }),
  regla({
    id: "paroxetina_tamoxifeno",
    ingredientesA: ["paroxetina"], ingredientesB: ["tamoxifeno"], severidad: "alta",
    titulo: "Paroxetina + tamoxifeno",
    mecanismo: "La inhibicion de CYP2D6 reduce la formacion del metabolito activo endoxifeno.",
    efecto: "Puede disminuir la eficacia de tamoxifeno.",
    recomendacion: "Preferir un antidepresivo con poca o nula inhibicion de CYP2D6 y coordinar con oncologia.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.paroxetina]
  }),
  regla({
    id: "paroxetina_fosamprenavir_ritonavir",
    ingredientesA: ["paroxetina"], ingredientesB: ["fosamprenavir", "ritonavir"], severidad: "moderada",
    titulo: "Paroxetina + fosamprenavir/ritonavir",
    mecanismo: "La coadministracion puede disminuir de forma importante la exposicion a paroxetina.",
    efecto: "Posible perdida de eficacia antidepresiva o necesidad de ajuste guiado por respuesta.",
    recomendacion: "Ajustar solo segun eficacia y tolerabilidad; no aumentar automaticamente sin seguimiento.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.paroxetina]
  }),
  regla({
    id: "citalopram_inhibidor_cyp2c19",
    ingredientesA: ["citalopram"], clasesB: ["inhibidor_cyp2c19"], severidad: "alta",
    titulo: "Citalopram + inhibidor CYP2C19",
    mecanismo: "La inhibicion de CYP2C19 aumenta la exposicion a citalopram.",
    efecto: "Aumenta el riesgo de prolongacion QT y arritmia ventricular.",
    recomendacion: "No exceder 20 mg/dia de citalopram con inhibidores CYP2C19 y valorar ECG/electrolitos segun riesgo.",
    categoria: "qt", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.citalopram]
  }),
  regla({
    id: "escitalopram_carbamazepina",
    ingredientesA: ["escitalopram"], ingredientesB: ["carbamazepina"], severidad: "informativa",
    titulo: "Escitalopram + carbamazepina",
    mecanismo: "La induccion enzimatica por carbamazepina puede aumentar la depuracion de escitalopram.",
    efecto: "Posible disminucion de la exposicion y respuesta a escitalopram.",
    recomendacion: "Vigilar respuesta clinica y evitar ajustes automaticos sin seguimiento.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.escitalopram]
  }),
  regla({
    id: "sertralina_fenitoina",
    ingredientesA: ["sertralina"], ingredientesB: ["fenitoina", "fosfenitoina"], severidad: "alta",
    titulo: "Sertralina + fenitoina/fosfenitoina",
    mecanismo: "Sertralina puede aumentar las concentraciones de fenitoina, un farmaco de margen terapeutico estrecho.",
    efecto: "Mayor riesgo de toxicidad neurologica por fenitoina.",
    recomendacion: "Monitorizar concentraciones al iniciar o titular sertralina y ajustar fenitoina si es necesario.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.sertralina]
  }),
  regla({
    id: "fluvoxamina_tizanidina_contraindicado",
    ingredientesA: ["fluvoxamina"], ingredientesB: ["tizanidina"], severidad: "critica",
    titulo: "Fluvoxamina + tizanidina",
    mecanismo: "La inhibicion de CYP1A2 aumenta marcadamente la exposicion a tizanidina.",
    efecto: "Riesgo de hipotension profunda, bradicardia y sedacion intensa.",
    recomendacion: "Combinacion contraindicada.",
    categoria: "cardiovascular", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluvoxamina], requiereJustificacion: true
  }),
  regla({
    id: "fluvoxamina_alosetron_contraindicado",
    ingredientesA: ["fluvoxamina"], ingredientesB: ["alosetron"], severidad: "critica",
    titulo: "Fluvoxamina + alosetron",
    mecanismo: "Fluvoxamina reduce de forma importante el metabolismo de alosetron.",
    efecto: "Aumento marcado de la exposicion y toxicidad de alosetron.",
    recomendacion: "Combinacion contraindicada.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluvoxamina], requiereJustificacion: true
  }),
  regla({
    id: "fluvoxamina_ramelteon_contraindicado",
    ingredientesA: ["fluvoxamina"], ingredientesB: ["ramelteon"], severidad: "critica",
    titulo: "Fluvoxamina + ramelteon",
    mecanismo: "Fluvoxamina aumenta de forma extrema la exposicion a ramelteon.",
    efecto: "Riesgo de sedacion y toxicidad por ramelteon.",
    recomendacion: "No usar la combinacion.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluvoxamina], requiereJustificacion: true
  }),
  regla({
    id: "fluvoxamina_benzodiacepinas_oxidativas",
    ingredientesA: ["fluvoxamina"], ingredientesB: ["alprazolam", "diazepam", "midazolam", "triazolam"], severidad: "alta",
    titulo: "Fluvoxamina + benzodiacepina metabolizada por oxidacion",
    mecanismo: "Fluvoxamina reduce la depuracion hepatica de estas benzodiacepinas.",
    efecto: "Acumulacion, sedacion, alteracion de memoria y deterioro psicomotor; diazepam no se recomienda habitualmente.",
    recomendacion: "Evitar diazepam; reducir y titular con cautela las otras benzodiacepinas y vigilar sedacion/respiracion.",
    categoria: "depresora_snc", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluvoxamina]
  }),
  regla({
    id: "fluvoxamina_clozapina",
    ingredientesA: ["fluvoxamina"], ingredientesB: ["clozapina"], severidad: "alta",
    titulo: "Fluvoxamina + clozapina",
    mecanismo: "La inhibicion metabolica puede elevar las concentraciones de clozapina.",
    efecto: "Mayor riesgo de sedacion, hipotension, convulsiones y otra toxicidad por clozapina.",
    recomendacion: "Usar solo con monitorizacion especializada de dosis, concentraciones y toxicidad.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluvoxamina]
  }),
  regla({
    id: "fluvoxamina_metadona",
    ingredientesA: ["fluvoxamina"], ingredientesB: ["metadona"], severidad: "alta",
    titulo: "Fluvoxamina + metadona",
    mecanismo: "Fluvoxamina puede aumentar las concentraciones de metadona; su suspension puede precipitar sintomas de abstinencia.",
    efecto: "Riesgo de intoxicacion opioide, sedacion, depresion respiratoria y cambios al suspender fluvoxamina.",
    recomendacion: "Coordinar con el prescriptor de metadona y vigilar sedacion, respiracion, QT y abstinencia durante cambios.",
    categoria: "depresora_snc", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluvoxamina]
  }),
  regla({
    id: "fluvoxamina_margen_estrecho",
    ingredientesA: ["fluvoxamina"], ingredientesB: ["mexiletina", "teofilina", "fenitoina", "carbamazepina", "tacrina"], severidad: "alta",
    titulo: "Fluvoxamina + farmaco de margen estrecho",
    mecanismo: "La inhibicion de enzimas CYP puede reducir la depuracion y elevar la exposicion del medicamento concomitante.",
    efecto: "Riesgo de toxicidad especifica del sustrato, incluida toxicidad neurologica, cardiaca o gastrointestinal.",
    recomendacion: "Evitar cuando exista alternativa o reducir/monitorizar concentraciones y respuesta conforme a la ficha del medicamento implicado.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluvoxamina]
  }),
  regla({
    id: "fluvoxamina_triciclicos",
    ingredientesA: ["fluvoxamina"], clasesB: ["triciclico"], severidad: "alta",
    titulo: "Fluvoxamina + antidepresivo triciclico",
    mecanismo: "Fluvoxamina puede aumentar significativamente las concentraciones del triciclico.",
    efecto: "Mayor toxicidad anticolinergica, cardiovascular, neurologica y serotoninergica.",
    recomendacion: "Vigilar concentraciones y toxicidad; reducir la dosis del triciclico cuando este indicado.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluvoxamina]
  }),
  regla({
    id: "fluvoxamina_betabloqueadores_diltiazem",
    ingredientesA: ["fluvoxamina"], ingredientesB: ["propranolol", "metoprolol", "diltiazem"], severidad: "moderada",
    titulo: "Fluvoxamina + propranolol, metoprolol o diltiazem",
    mecanismo: "Fluvoxamina puede aumentar betabloqueadores metabolizados hepaticamente; se ha comunicado bradicardia con diltiazem.",
    efecto: "Riesgo de bradicardia, hipotension y ortostatismo.",
    recomendacion: "Usar dosis inicial menor cuando corresponda y vigilar pulso, presion y sintomas de hipoperfusion.",
    categoria: "cardiovascular", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluvoxamina]
  }),
  regla({
    id: "fluvoxamina_omeprazol",
    ingredientesA: ["fluvoxamina"], ingredientesB: ["omeprazol"], severidad: "moderada",
    titulo: "Fluvoxamina + omeprazol",
    mecanismo: "La inhibicion de CYP2C19 puede aumentar la exposicion a omeprazol.",
    efecto: "Puede aumentar efectos adversos del inhibidor de bomba de protones.",
    recomendacion: "Vigilar tolerabilidad y revisar dosis si aparecen efectos adversos.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluvoxamina]
  }),
  regla({
    id: "fluvoxamina_alcohol",
    ingredientesA: ["fluvoxamina"], ingredientesB: ["alcohol"], severidad: "moderada",
    titulo: "Fluvoxamina + alcohol",
    mecanismo: "Aunque estudios de dosis unica no mostraron una interaccion farmacocinetica importante, ambos pueden afectar el sistema nervioso central.",
    efecto: "Posible mayor deterioro del juicio, coordinacion o somnolencia.",
    recomendacion: "Evitar alcohol durante el tratamiento.",
    categoria: "depresora_snc", tipoInteraccion: "farmacodinamica", fuentes: [FUENTES_REGULATORIAS_ISRS.fluvoxamina]
  })
]);
