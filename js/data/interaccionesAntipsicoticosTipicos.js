/**
 * Matriz regulatoria de antipsicoticos de primera generacion.
 * Las reglas se declaran una sola vez y el catalogo oficial genera la
 * propiedad reciproca en ambas contrapartes por clinicalMedicationId.
 */

export const ANTIPSICOTICOS_TIPICOS_CATALOG_IDS = Object.freeze([
  "haloperidol", "droperidol", "clorpromazina", "levomepromazina",
  "flufenazina", "perfenazina", "proclorperazina", "trifluoperazina",
  "tioridazina", "mesoridazina", "pimozida", "tiotixeno",
  "clorprotixeno", "flupentixol", "zuclopentixol", "pipotiazina",
  "loxapina", "molindona", "promazina", "periciazina"
]);

export const FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS = Object.freeze({
  haloperidol: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=af0159a8-dff5-449a-aa2b-a0c430081e21",
  clorpromazina: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=41b86f9d-d7e2-4296-8d88-e8257c7cbed2",
  perfenazina: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=28f0cc81-538c-4a4b-be8d-509428fcbb9c",
  flufenazina: "https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?name=6cd6ba35-3481-48c1-87db-dc74ce9d7d75&setid=6cd6ba35-3481-48c1-87db-dc74ce9d7d75",
  tioridazina: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=1fd16a99-e856-4a37-9dae-c443714fac14",
  pimozida: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=70b079e2-a1f7-4a93-8685-d60a4d7c1280"
});

const TODAS_LAS_FUENTES = Object.freeze(Object.values(FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS));
const TIPICOS_QT = Object.freeze([
  "haloperidol", "droperidol", "clorpromazina", "levomepromazina", "flufenazina",
  "perfenazina", "proclorperazina", "tioridazina", "mesoridazina", "pimozida",
  "tiotixeno", "clorprotixeno", "flupentixol", "zuclopentixol", "pipotiazina",
  "promazina", "periciazina"
]);
const FENOTIAZINAS = Object.freeze([
  "clorpromazina", "levomepromazina", "flufenazina", "perfenazina",
  "proclorperazina", "trifluoperazina", "tioridazina", "mesoridazina",
  "pipotiazina", "promazina", "periciazina"
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

export const REGLAS_INTERACCIONES_ANTIPSICOTICOS_TIPICOS = Object.freeze([
  regla({
    id: "tipico_duplicidad_antipsicotica", clasesA: ["antipsicotico_tipico"], clasesB: ["antipsicotico"], severidad: "alta",
    titulo: "Duplicidad de antipsicoticos",
    mecanismo: "El bloqueo dopaminergico y otros efectos receptoriales pueden sumarse sin aportar necesariamente mayor eficacia.",
    efecto: "Mayor riesgo de sintomas extrapiramidales, acatisia, discinesia, sedacion, hipotension, hiperprolactinemia, QT y sindrome neuroleptico maligno.",
    recomendacion: "Evitar polifarmacia antipsicotica rutinaria; si existe transicion o indicacion especializada, documentar objetivo, duracion, dosis y vigilancia.",
    categoria: "duplicidad_terapeutica"
  }),
  regla({
    id: "tipico_depresor_snc", clasesA: ["antipsicotico_tipico"], clasesB: ["depresor_snc"], severidad: "moderada",
    titulo: "Antipsicotico tipico + depresor del SNC",
    mecanismo: "Los efectos sedantes y de deterioro psicomotor son aditivos.",
    efecto: "Mayor somnolencia, confusion, caidas, aspiracion y deterioro para conducir u operar maquinaria.",
    recomendacion: "Reducir carga sedante cuando sea posible y vigilar conciencia, marcha, deglucion y funcion respiratoria segun el depresor implicado.",
    categoria: "depresora_snc"
  }),
  regla({
    id: "tipico_opioide_respiratorio", clasesA: ["antipsicotico_tipico"], clasesB: ["opioide"], severidad: "alta",
    titulo: "Antipsicotico tipico + opioide",
    mecanismo: "La sedacion del antipsicotico se suma a la depresion respiratoria y del estado de alerta por opioides.",
    efecto: "Riesgo de sedacion profunda, aspiracion, hipoventilacion, coma y caidas.",
    recomendacion: "Evitar combinaciones no indispensables; usar dosis minimas y vigilar sedacion, frecuencia respiratoria y saturacion.",
    categoria: "depresora_snc"
  }),
  regla({
    id: "tipico_alcohol", clasesA: ["antipsicotico_tipico"], ingredientesB: ["alcohol"], severidad: "alta",
    titulo: "Antipsicotico tipico + alcohol",
    mecanismo: "El alcohol potencia depresion del SNC, hipotension y deterioro psicomotor.",
    efecto: "Mayor sedacion, desinhibicion, caidas, aspiracion e incapacidad para conducir.",
    recomendacion: "Evitar alcohol durante el tratamiento.",
    categoria: "depresora_snc"
  }),
  regla({
    id: "tipico_benzodiacepina_gabapentinoide", clasesA: ["antipsicotico_tipico"], clasesB: ["benzodiacepina", "gabapentinoide"], severidad: "alta",
    titulo: "Antipsicotico tipico + sedante de alto impacto",
    mecanismo: "Benzodiacepinas y gabapentinoides pueden potenciar sedacion, alteracion de coordinacion y depresion respiratoria en pacientes vulnerables.",
    efecto: "Mayor riesgo de somnolencia intensa, delirium, caidas y compromiso respiratorio, especialmente con otros depresores.",
    recomendacion: "Revisar indicacion y dosis; vigilar estado mental, marcha, respiracion y uso concomitante de opioides o alcohol.",
    categoria: "depresora_snc"
  }),
  regla({
    id: "tipico_dopaminergico_antagonismo", clasesA: ["antipsicotico_tipico"], ingredientesB: ["levodopa", "pramipexol", "ropinirol", "apomorfina", "bromocriptina"], severidad: "alta",
    titulo: "Antipsicotico tipico + tratamiento dopaminergico",
    mecanismo: "El antagonismo D2 puede oponerse a levodopa y agonistas dopaminergicos.",
    efecto: "Perdida de control motor, empeoramiento del parkinsonismo o menor respuesta del tratamiento dopaminergico.",
    recomendacion: "Evitar cuando sea posible; coordinar con neurologia y elegir alternativas con menor antagonismo dopaminergico si se requiere tratar psicosis.",
    categoria: "antagonismo_dopaminergico"
  }),
  regla({
    id: "tipico_metoclopramida_eps", clasesA: ["antipsicotico_tipico"], ingredientesB: ["metoclopramida"], severidad: "alta",
    titulo: "Antipsicotico tipico + metoclopramida",
    mecanismo: "Ambos bloquean receptores dopaminergicos centrales.",
    efecto: "Aumenta el riesgo de distonia, acatisia, parkinsonismo, discinesia tardia y sindrome neuroleptico maligno.",
    recomendacion: "Evitar la combinacion; utilizar un antiemetico alternativo cuando sea viable.",
    categoria: "extrapiramidal"
  }),
  regla({
    id: "tipico_litio_neurotoxicidad", clasesA: ["antipsicotico_tipico"], ingredientesB: ["litio"], severidad: "alta",
    titulo: "Antipsicotico tipico + litio",
    mecanismo: "La combinacion puede producir neurotoxicidad aun con concentraciones de litio aparentemente terapeuticas.",
    efecto: "Riesgo de confusion, temblor, rigidez, hiperreflexia, encefalopatia, sintomas extrapiramidales o sindrome neuroleptico maligno.",
    recomendacion: "Usar solo con indicacion clara; vigilar exploracion neurologica, hidratacion, funcion renal, temperatura y litemia.",
    categoria: "neurotoxicidad"
  }),
  regla({
    id: "haloperidol_litio_encefalopatia", ingredientesA: ["haloperidol"], ingredientesB: ["litio"], severidad: "critica",
    titulo: "Haloperidol + litio: encefalopatia neurotoxica",
    mecanismo: "Se ha descrito un sindrome encefalopatico con neurotoxicidad grave durante la combinacion.",
    efecto: "Debilidad, fiebre, temblor, confusion, sintomas extrapiramidales, leucocitosis, alteraciones enzimaticas y posible dano cerebral irreversible.",
    recomendacion: "Evitar si existe alternativa; si se usa, mantener vigilancia estrecha y suspender ante signos tempranos de neurotoxicidad.",
    categoria: "neurotoxicidad", requiereJustificacion: true,
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.haloperidol]
  }),
  regla({
    id: "tipico_umbral_convulsivo", clasesA: ["antipsicotico_tipico"], ingredientesB: ["bupropion", "tramadol", "clozapina", "teofilina"], severidad: "alta",
    titulo: "Antipsicotico tipico + farmaco que reduce el umbral convulsivo",
    mecanismo: "Los medicamentos implicados pueden facilitar actividad convulsiva por mecanismos diferentes y aditivos.",
    efecto: "Mayor riesgo de convulsiones, especialmente con dosis altas, antecedentes neurologicos o abstinencia de alcohol/sedantes.",
    recomendacion: "Evitar acumulacion de factores, titular lentamente y corregir alteraciones metabolicas; establecer plan de vigilancia segun riesgo.",
    categoria: "convulsiva"
  }),
  regla({
    id: "tipico_anticolinergico", clasesA: ["antipsicotico_tipico"], clasesB: ["anticolinergico"], severidad: "moderada",
    titulo: "Antipsicotico tipico + anticolinergico",
    mecanismo: "La carga muscarinica puede sumarse, particularmente con fenotiazinas de baja potencia.",
    efecto: "Mayor riesgo de delirium, vision borrosa, glaucoma, taquicardia, estrenimiento, ileo, retencion urinaria e hipertermia.",
    recomendacion: "No usar anticolinergicos de forma preventiva rutinaria; revisar carga total, indicacion, transito intestinal, miccion, cognicion y temperatura.",
    categoria: "anticolinergica"
  }),
  regla({
    id: "fenotiazina_epinefrina", ingredientesA: FENOTIAZINAS, ingredientesB: ["epinefrina"], severidad: "alta",
    titulo: "Fenotiazina + epinefrina",
    mecanismo: "El bloqueo alfa adrenergico puede invertir el efecto vasopresor beta de epinefrina.",
    efecto: "Hipotension paradojica o agravamiento del colapso circulatorio.",
    recomendacion: "No usar epinefrina para tratar hipotension atribuible a fenotiazinas; seguir protocolo hemodinamico con vasopresor apropiado.",
    categoria: "cardiovascular", requiereJustificacion: true
  }),
  regla({
    id: "haloperidol_epinefrina", ingredientesA: ["haloperidol"], ingredientesB: ["epinefrina"], severidad: "alta",
    titulo: "Haloperidol + epinefrina como vasopresor",
    mecanismo: "El bloqueo adrenergico por haloperidol puede producir una respuesta paradojica a epinefrina.",
    efecto: "Posible descenso adicional de la presion arterial.",
    recomendacion: "Evitar epinefrina para corregir hipotension relacionada con haloperidol; usar el manejo recomendado en ficha tecnica.",
    categoria: "cardiovascular", fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.haloperidol]
  }),
  regla({
    id: "fenotiazina_antihipertensivo", ingredientesA: FENOTIAZINAS, clasesB: ["ieca", "ara2", "betabloqueador", "calcioantagonista", "diuretico", "nitrato"], severidad: "moderada",
    titulo: "Fenotiazina + tratamiento antihipertensivo",
    mecanismo: "El bloqueo alfa y la vasodilatacion pueden sumarse al efecto antihipertensivo o a la deplecion de volumen.",
    efecto: "Hipotension ortostatica, sincope, caidas o hipoperfusion.",
    recomendacion: "Controlar presion sentado/de pie, hidratacion y caidas; titular con cautela.",
    categoria: "cardiovascular"
  }),
  regla({
    id: "tipico_qt_aditivo", ingredientesA: TIPICOS_QT, clasesB: ["qt"], severidad: "alta",
    titulo: "Antipsicotico tipico + farmaco que prolonga QT",
    mecanismo: "La prolongacion de repolarizacion puede ser aditiva y aumentar con concentraciones elevadas.",
    efecto: "Mayor riesgo de QTc prolongado, torsades de pointes, arritmia ventricular, sincope y muerte subita.",
    recomendacion: "Evitar combinaciones de alto riesgo; revisar ECG, potasio, magnesio, frecuencia cardiaca, dosis y alternativas.",
    categoria: "qt", tipoInteraccion: "QT", requiereJustificacion: true
  }),
  regla({
    id: "tipico_qt_electrolitos", ingredientesA: TIPICOS_QT, ingredientesB: ["hidroclorotiazida", "clortalidona", "furosemida", "bumetanida", "dexametasona", "prednisona"], severidad: "alta",
    titulo: "Antipsicotico tipico con riesgo QT + farmaco que altera electrolitos",
    mecanismo: "Hipopotasemia, hipomagnesemia o hipocalcemia aumentan la susceptibilidad a arritmia por farmacos que prolongan QT.",
    efecto: "Mayor riesgo de torsades de pointes y arritmia ventricular.",
    recomendacion: "Medir y corregir electrolitos, valorar ECG y evitar la combinacion si el riesgo no puede controlarse.",
    categoria: "qt", tipoInteraccion: "electrolitica"
  }),
  regla({
    id: "haloperidol_inhibidores_cyp", ingredientesA: ["haloperidol"], ingredientesB: ["itraconazol", "ketoconazol", "ritonavir", "fluoxetina", "fluvoxamina", "paroxetina", "sertralina", "quinidina", "venlafaxina", "alprazolam", "buspirona", "prometazina", "clorpromazina"], severidad: "alta",
    titulo: "Haloperidol + inhibidor CYP3A4/CYP2D6",
    mecanismo: "La inhibicion de CYP3A4 y/o CYP2D6 puede aumentar la exposicion a haloperidol.",
    efecto: "Mayor riesgo de efectos extrapiramidales, sedacion, hipotension y prolongacion QT.",
    recomendacion: "Vigilar efectos aumentados y QT; reducir haloperidol cuando corresponda conforme a respuesta y ficha tecnica.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica",
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.haloperidol]
  }),
  regla({
    id: "haloperidol_inductores_cyp3a4", ingredientesA: ["haloperidol"], ingredientesB: ["carbamazepina", "rifampicina", "fenitoina", "fenobarbital", "hierba_san_juan"], severidad: "moderada",
    titulo: "Haloperidol + inductor enzimatico",
    mecanismo: "La induccion de CYP3A4 y otras vias puede reducir concentraciones de haloperidol.",
    efecto: "Posible perdida de eficacia o recaida; al retirar el inductor, haloperidol puede aumentar de forma importante.",
    recomendacion: "Vigilar respuesta durante inicio y suspension del inductor; ajustar gradualmente y reevaluar tras cambios.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica",
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.haloperidol]
  }),
  regla({
    id: "perfenazina_flufenazina_inhibidor_cyp2d6", ingredientesA: ["perfenazina", "flufenazina"], ingredientesB: ["fluoxetina", "paroxetina", "quinidina", "bupropion", "duloxetina", "mirabegron", "sertralina", "fluvoxamina", "prometazina"], severidad: "alta",
    titulo: "Fenotiazina sustrato CYP2D6 + inhibidor CYP2D6",
    mecanismo: "La inhibicion de CYP2D6 puede elevar la concentracion del antipsicotico.",
    efecto: "Mayor riesgo de sintomas extrapiramidales, sedacion, hipotension y efectos cardiacos.",
    recomendacion: "Vigilar toxicidad y considerar menor dosis o alternativa con menor inhibicion CYP2D6.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica",
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.perfenazina, FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.flufenazina]
  }),
  regla({
    id: "fenotiazina_triciclico", ingredientesA: FENOTIAZINAS, clasesB: ["triciclico"], severidad: "alta",
    titulo: "Fenotiazina + antidepresivo triciclico",
    mecanismo: "Pueden sumarse anticolinergia, hipotension, sedacion, reduccion del umbral convulsivo y alteraciones de conduccion; tambien puede existir inhibicion metabolica reciproca.",
    efecto: "Mayor toxicidad cardiovascular, neurologica y anticolinergica.",
    recomendacion: "Evitar carga alta; usar dosis prudentes y vigilar ECG, presion, estado mental, transito intestinal y convulsiones.",
    categoria: "anticolinergica"
  }),
  regla({
    id: "pimozida_qt_contraindicado", ingredientesA: ["pimozida"], clasesB: ["qt"], severidad: "critica",
    titulo: "Pimozida + farmaco que prolonga QT",
    mecanismo: "Pimozida prolonga QT y el efecto puede ser aditivo con otras sustancias que alteran repolarizacion.",
    efecto: "Riesgo de torsades de pointes, arritmia ventricular y muerte subita.",
    recomendacion: "Combinacion contraindicada; corregir potasio y magnesio y realizar ECG conforme a ficha tecnica.",
    categoria: "qt", tipoInteraccion: "QT", requiereJustificacion: true,
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.pimozida]
  }),
  regla({
    id: "pimozida_macrolidos_contraindicado", ingredientesA: ["pimozida"], ingredientesB: ["claritromicina", "eritromicina", "azitromicina"], severidad: "critica",
    titulo: "Pimozida + macrolido",
    mecanismo: "La inhibicion de CYP3A4 y la suma de riesgo QT pueden elevar pimozida y favorecer arritmias.",
    efecto: "Se han comunicado arritmias graves, torsades y muertes subitas con esta combinacion.",
    recomendacion: "Combinacion contraindicada.",
    categoria: "qt", tipoInteraccion: "farmacocinetica", requiereJustificacion: true,
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.pimozida]
  }),
  regla({
    id: "pimozida_inhibidores_cyp3a4_contraindicado", ingredientesA: ["pimozida"], ingredientesB: ["itraconazol", "ketoconazol", "ritonavir", "indinavir", "saquinavir", "nelfinavir", "nefazodona", "zileuton", "aprepitant"], severidad: "critica",
    titulo: "Pimozida + inhibidor CYP3A4",
    mecanismo: "La inhibicion de CYP3A4 puede aumentar marcadamente la exposicion a pimozida.",
    efecto: "Mayor riesgo de QT prolongado, torsades de pointes y arritmia potencialmente mortal.",
    recomendacion: "Combinacion contraindicada o a evitar expresamente conforme a la ficha tecnica.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", requiereJustificacion: true,
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.pimozida]
  }),
  regla({
    id: "pimozida_inhibidores_cyp2d6_contraindicado", ingredientesA: ["pimozida"], ingredientesB: ["paroxetina", "fluoxetina", "quinidina", "bupropion"], severidad: "critica",
    titulo: "Pimozida + inhibidor fuerte CYP2D6",
    mecanismo: "La inhibicion de CYP2D6 aumenta la exposicion a pimozida; paroxetina incremento de forma marcada AUC y concentracion maxima.",
    efecto: "Mayor riesgo de prolongacion QT y arritmia ventricular grave.",
    recomendacion: "Combinacion contraindicada.",
    categoria: "metabolica_cyp", tipoInteraccion: "farmacocinetica", requiereJustificacion: true,
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.pimozida]
  }),
  regla({
    id: "pimozida_isrs_contraindicado", ingredientesA: ["pimozida"], ingredientesB: ["citalopram", "escitalopram", "sertralina", "fluoxetina", "paroxetina", "fluvoxamina"], severidad: "critica",
    titulo: "Pimozida + ISRS contraindicado",
    mecanismo: "Segun el ISRS puede existir prolongacion QT aditiva o inhibicion de CYP2D6/CYP3A4.",
    efecto: "Riesgo de QT prolongado, bradicardia, torsades de pointes y arritmia ventricular.",
    recomendacion: "No combinar conforme a las fichas tecnicas implicadas.",
    categoria: "qt", tipoInteraccion: "QT", requiereJustificacion: true,
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.pimozida]
  }),
  regla({
    id: "tioridazina_inhibidores_cyp2d6_contraindicado", ingredientesA: ["tioridazina"], ingredientesB: ["fluoxetina", "paroxetina", "quinidina", "bupropion", "duloxetina", "mirabegron", "sertralina"], severidad: "critica",
    titulo: "Tioridazina + inhibidor CYP2D6",
    mecanismo: "La inhibicion de CYP2D6 reduce el metabolismo de tioridazina y aumenta su exposicion.",
    efecto: "Aumento de QTc, torsades de pointes, arritmia ventricular y muerte subita.",
    recomendacion: "Combinacion contraindicada.",
    categoria: "qt", tipoInteraccion: "farmacocinetica", requiereJustificacion: true,
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.tioridazina]
  }),
  regla({
    id: "tioridazina_otros_inhibidores_contraindicado", ingredientesA: ["tioridazina"], ingredientesB: ["fluvoxamina", "propranolol", "pindolol"], severidad: "critica",
    titulo: "Tioridazina + inhibidor documentado de su metabolismo",
    mecanismo: "Estos medicamentos pueden inhibir de forma apreciable el metabolismo de tioridazina.",
    efecto: "Mayor exposicion, prolongacion QTc y riesgo de arritmia fatal.",
    recomendacion: "Combinacion contraindicada.",
    categoria: "qt", tipoInteraccion: "farmacocinetica", requiereJustificacion: true,
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.tioridazina]
  }),
  regla({
    id: "tioridazina_qt_contraindicado", ingredientesA: ["tioridazina"], clasesB: ["qt"], severidad: "critica",
    titulo: "Tioridazina + farmaco que prolonga QT",
    mecanismo: "La prolongacion QT es aditiva y puede aumentar con inhibicion metabolica.",
    efecto: "Riesgo de torsades de pointes, arritmia ventricular y muerte subita.",
    recomendacion: "Combinacion contraindicada.",
    categoria: "qt", tipoInteraccion: "QT", requiereJustificacion: true,
    fuentes: [FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS.tioridazina]
  })
]);
