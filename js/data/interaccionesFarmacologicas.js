import {
  evaluarMedicamentosPaciente,
  obtenerIndicadorSeguridadMedicamento
} from "../services/motorClinicoMedicamentos.js";

const CATEGORIAS_MEDICAMENTOS = [
  { id: "isrs", nombre: "ISRS", patrones: ["sertralina", "fluoxetina", "paroxetina", "escitalopram", "citalopram", "fluvoxamina"] },
  { id: "irsn", nombre: "IRSN", patrones: ["venlafaxina", "desvenlafaxina", "duloxetina", "milnacipran"] },
  { id: "triciclico", nombre: "Antidepresivo triciclico", patrones: ["amitriptilina", "imipramina", "clomipramina", "nortriptilina"] },
  { id: "imao", nombre: "IMAO", patrones: ["fenelzina", "tranilcipromina", "moclobemida", "selegilina"] },
  { id: "benzodiacepina", nombre: "Benzodiacepina", patrones: ["clonazepam", "lorazepam", "diazepam", "alprazolam", "bromazepam", "midazolam", "clobazam", "clorazepato"] },
  { id: "antipsicotico", nombre: "Antipsicotico", patrones: ["risperidona", "olanzapina", "quetiapina", "haloperidol", "clozapina", "aripiprazol", "paliperidona", "ziprasidona", "amisulprida", "levomepromazina", "clorpromazina"] },
  { id: "qt", nombre: "Riesgo de QT", patrones: ["haloperidol", "ziprasidona", "quetiapina", "risperidona", "escitalopram", "citalopram", "amitriptilina", "clorpromazina", "macrolido", "azitromicina", "claritromicina", "levofloxacino", "ciprofloxacino"] },
  { id: "litio", nombre: "Litio", patrones: ["litio", "carbonato de litio"] },
  { id: "aine", nombre: "AINE", patrones: ["ibuprofeno", "naproxeno", "diclofenaco", "ketorolaco", "celecoxib", "indometacina"] },
  { id: "ieca_ara", nombre: "IECA/ARA-II", patrones: ["enalapril", "captopril", "lisinopril", "losartan", "valsartan", "telmisartan"] },
  { id: "diuretico", nombre: "Diuretico", patrones: ["hidroclorotiazida", "furosemida", "bumetanida", "espironolactona", "eplerenona", "clortalidona"] },
  { id: "ahorrador_potasio", nombre: "Ahorrador de potasio", patrones: ["espironolactona", "eplerenona"] },
  { id: "antiepileptico_inductor", nombre: "Inductor enzimatico", patrones: ["carbamazepina", "oxcarbazepina", "fenitoina", "fenobarbital"] },
  { id: "valproato", nombre: "Valproato", patrones: ["valproato", "acido valproico", "divalproato"] },
  { id: "lamotrigina", nombre: "Lamotrigina", patrones: ["lamotrigina"] },
  { id: "serotoninergico_extra", nombre: "Serotoninergico", patrones: ["tramadol", "linezolid", "sumatriptan", "rizatriptan", "metilfenidato", "trazodona", "mirtazapina"] },
  { id: "depresor_snc", nombre: "Depresor SNC", patrones: ["opioide", "morfina", "oxicodona", "tramadol", "pregabalina", "gabapentina", "zolpidem", "hidroxicina", "difenhidramina", "fenobarbital", "baclofeno", "tizanidina"] },
  { id: "anticoagulante", nombre: "Anticoagulante/antiagregante", patrones: ["warfarina", "acenocumarol", "rivaroxaban", "apixaban", "dabigatran", "heparina", "enoxaparina", "aspirina", "acido acetilsalicilico", "clopidogrel"] },
  { id: "anticolinergico", nombre: "Carga anticolinergica", patrones: ["amitriptilina", "imipramina", "clomipramina", "clozapina", "olanzapina", "quetiapina", "biperideno", "trihexifenidilo", "difenhidramina", "clorfenamina", "butilhioscina"] },
  { id: "estatina", nombre: "Estatina", patrones: ["atorvastatina", "rosuvastatina", "simvastatina", "pravastatina"] },
  { id: "inhibidor_cyp3a4", nombre: "Inhibidor CYP3A4/P-gp", patrones: ["claritromicina", "eritromicina", "fluconazol", "itraconazol", "ketoconazol", "verapamilo", "diltiazem", "amiodarona"] },
  { id: "fluoroquinolona", nombre: "Fluoroquinolona", patrones: ["ciprofloxacino", "levofloxacino", "moxifloxacino"] },
  { id: "corticoide_sistemico", nombre: "Corticoide sistemico", patrones: ["prednisona", "hidrocortisona", "dexametasona", "metilprednisolona"] },
  { id: "hipoglucemiante", nombre: "Hipoglucemiante", patrones: ["insulina", "glibenclamida", "gliclazida", "metformina", "sitagliptina", "linagliptina", "liraglutida", "semaglutida", "dapagliflozina", "empagliflozina"] }
];

const REGLAS_INTERACCIONES = [
  {
    gruposA: ["isrs", "irsn", "triciclico", "imao", "serotoninergico_extra"],
    gruposB: ["isrs", "irsn", "triciclico", "imao", "serotoninergico_extra", "litio"],
    severidad: "Relevante",
    titulo: "Aumento de carga serotoninergica",
    efecto: "Puede incrementar el riesgo de sindrome serotoninergico, con agitacion, temblor, hiperreflexia, diaforesis, diarrea, fiebre o confusion.",
    recomendacion: "Valorar necesidad de la combinacion, vigilar sintomas serotoninergicos y ajustar segun juicio clinico. Evitar combinaciones con IMAO salvo indicacion especializada."
  },
  {
    gruposA: ["benzodiacepina"],
    gruposB: ["antipsicotico", "depresor_snc"],
    severidad: "Precaucion",
    titulo: "Sedacion y depresion del sistema nervioso central",
    efecto: "Puede aumentar somnolencia, caidas, alteracion psicomotora, hipotension y, en pacientes vulnerables, depresion respiratoria.",
    recomendacion: "Usar dosis minimas efectivas, vigilar sedacion, marcha, estado de alerta y riesgo respiratorio."
  },
  {
    gruposA: ["litio"],
    gruposB: ["aine", "ieca_ara", "diuretico"],
    severidad: "Alta",
    titulo: "Aumento potencial de niveles de litio",
    efecto: "AINEs, IECA/ARA-II y diureticos pueden elevar concentraciones de litio y favorecer toxicidad: temblor, ataxia, nausea, diarrea, confusion o deterioro renal.",
    recomendacion: "Si la combinacion es necesaria, considerar control de litio, funcion renal, hidratacion y vigilancia estrecha."
  },
  {
    gruposA: ["valproato"],
    gruposB: ["lamotrigina"],
    severidad: "Alta",
    titulo: "Valproato aumenta lamotrigina",
    efecto: "El valproato puede elevar niveles de lamotrigina y aumentar el riesgo de exantema grave, incluyendo reacciones cutaneas severas.",
    recomendacion: "Titular lentamente lamotrigina y vigilar exantema, fiebre o sintomas sistemicos."
  },
  {
    gruposA: ["antiepileptico_inductor"],
    gruposB: ["antipsicotico", "isrs", "irsn", "triciclico", "lamotrigina"],
    severidad: "Relevante",
    titulo: "Induccion enzimatica",
    efecto: "Inductores como carbamazepina pueden disminuir niveles de psicofarmacos y reducir respuesta terapeutica.",
    recomendacion: "Revisar eficacia clinica, efectos adversos y necesidad de ajuste de dosis o alternativa."
  },
  {
    gruposA: ["qt"],
    gruposB: ["qt"],
    severidad: "Relevante",
    titulo: "Prolongacion del intervalo QT",
    efecto: "La combinacion de farmacos con riesgo de QT puede aumentar riesgo de arritmias, especialmente con hipokalemia, cardiopatia o dosis elevadas.",
    recomendacion: "Valorar ECG, electrolitos, dosis y factores de riesgo cardiovasculares."
  },
  {
    gruposA: ["isrs", "irsn", "triciclico"],
    gruposB: ["aine", "anticoagulante"],
    severidad: "Precaucion",
    titulo: "Riesgo de sangrado",
    efecto: "Antidepresivos serotoninergicos pueden aumentar riesgo de sangrado, especialmente con AINEs, anticoagulantes o antiagregantes.",
    recomendacion: "Vigilar sangrado gastrointestinal, equimosis y factores de riesgo; considerar gastroproteccion si aplica."
  },
  {
    gruposA: ["anticolinergico"],
    gruposB: ["anticolinergico"],
    severidad: "Precaucion",
    titulo: "Carga anticolinergica acumulada",
    efecto: "Puede favorecer boca seca, constipacion, retencion urinaria, vision borrosa, confusion o deterioro cognitivo, sobre todo en adultos mayores.",
    recomendacion: "Revisar carga total, sintomas anticolinergicos y necesidad de cada farmaco."
  },
  {
    gruposA: ["ieca_ara"],
    gruposB: ["ahorrador_potasio"],
    severidad: "Relevante",
    titulo: "Riesgo de hiperpotasemia",
    efecto: "La combinacion puede elevar potasio, especialmente con enfermedad renal, edad avanzada, deshidratacion o dosis altas.",
    recomendacion: "Vigilar potasio, creatinina, presion arterial y sintomas compatibles con alteraciones electroliticas."
  },
  {
    gruposA: ["estatina"],
    gruposB: ["inhibidor_cyp3a4"],
    severidad: "Relevante",
    titulo: "Aumento de exposicion a estatinas",
    efecto: "Algunos inhibidores enzimaticos pueden aumentar niveles de estatinas y favorecer mialgias, miopatia o rabdomiolisis, segun estatina y dosis.",
    recomendacion: "Valorar alternativa, reduccion temporal, cambio de estatina o vigilancia de sintomas musculares y CK si hay sospecha clinica."
  },
  {
    gruposA: ["fluoroquinolona"],
    gruposB: ["corticoide_sistemico"],
    severidad: "Precaucion",
    titulo: "Riesgo tendinoso aumentado",
    efecto: "Fluoroquinolonas combinadas con corticoides pueden aumentar riesgo de tendinopatia o ruptura tendinosa, en especial en adultos mayores.",
    recomendacion: "Evitar si hay alternativas; advertir dolor tendinoso y suspender/valorar si aparecen sintomas."
  },
  {
    gruposA: ["hipoglucemiante"],
    gruposB: ["hipoglucemiante"],
    severidad: "Precaucion",
    titulo: "Riesgo de hipoglucemia o variabilidad glucemica",
    efecto: "La combinacion de farmacos hipoglucemiantes puede aumentar riesgo de hipoglucemia, especialmente con insulinas o sulfonilureas.",
    recomendacion: "Revisar glucemias, ingesta, funcion renal y educacion sobre sintomas de hipoglucemia."
  }
];

function normalizarTexto(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function categoriasDeMedicamento(nombre = "") {
  const texto = normalizarTexto(nombre);
  return CATEGORIAS_MEDICAMENTOS
    .filter((categoria) => categoria.patrones.some((patron) => texto.includes(normalizarTexto(patron))))
    .map((categoria) => categoria.id);
}

function coincideRegla(categoriasA, categoriasB, regla) {
  const directa = categoriasA.some((cat) => regla.gruposA.includes(cat)) && categoriasB.some((cat) => regla.gruposB.includes(cat));
  const inversa = categoriasA.some((cat) => regla.gruposB.includes(cat)) && categoriasB.some((cat) => regla.gruposA.includes(cat));
  return directa || inversa;
}

function claveInteraccion(medA, medB, titulo) {
  return [normalizarTexto(medA), normalizarTexto(medB)].sort().join("|") + `|${titulo}`;
}

export function detectarInteraccionesFarmacologicas(medicamentos = []) {
  const lista = medicamentos
    .map((med, index) => ({
      id: med.id || `med-${index}`,
      nombre: med.medicamento || med.nombre || med.texto || String(med || ""),
      indicacion: med.indicacion || "",
      categorias: categoriasDeMedicamento(med.medicamento || med.nombre || med.texto || String(med || ""))
    }))
    .filter((med) => med.nombre.trim());

  const detectadas = [];
  const vistas = new Set();

  for (let i = 0; i < lista.length; i += 1) {
    for (let j = i + 1; j < lista.length; j += 1) {
      const medA = lista[i];
      const medB = lista[j];
      if (!medA.categorias.length || !medB.categorias.length) continue;

      REGLAS_INTERACCIONES.forEach((regla) => {
        if (!coincideRegla(medA.categorias, medB.categorias, regla)) return;
        const clave = claveInteraccion(medA.nombre, medB.nombre, regla.titulo);
        if (vistas.has(clave)) return;
        vistas.add(clave);
        detectadas.push({
          medicamentos: [medA.nombre, medB.nombre],
          severidad: regla.severidad,
          titulo: regla.titulo,
          efecto: regla.efecto,
          recomendacion: regla.recomendacion
        });
      });
    }
  }

  return detectadas;
}

export function detectarAlertasClinicasMedicamentos(medicamentos = [], paciente = {}) {
  const evaluacion = evaluarMedicamentosPaciente({ paciente, medicamentos });
  return {
    ...evaluacion,
    indicador: obtenerIndicadorSeguridadMedicamento(evaluacion.alertas)
  };
}
