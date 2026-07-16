import { MEDICAMENTOS_SUPLEMENTARIOS } from "./medicamentosSuplementarios.js";
import { enriquecerMedicamentoClinico } from "./vinculosClinicos.js";
import {
  construirCapaFarmacologicaUnificada,
  resumirCoberturaFarmacologica
} from "./farmacologiaUnificada.js";

export const MEDICAMENTOS = [
  {
    nombre: "Sertralina",
    clase: "ISRS",
    dosisHabitual: "50-200 mg/dia",
    notas: "Depresion, ansiedad, TOC, TEPT.",
    presentaciones: ["tabletas de 25 mg", "tabletas de 50 mg", "tabletas de 100 mg"]
  },
  {
    nombre: "Fluoxetina",
    clase: "ISRS",
    dosisHabitual: "20-60 mg/dia",
    notas: "Depresion, TOC, bulimia.",
    presentaciones: ["capsulas de 20 mg", "tabletas de 20 mg", "solucion oral de 20 mg/5 ml"]
  },
  {
    nombre: "Paroxetina",
    clase: "ISRS",
    dosisHabitual: "20-50 mg/dia",
    notas: "Ansiedad; vigilar efectos anticolinergicos.",
    presentaciones: ["tabletas de 20 mg", "tabletas de 30 mg"]
  },
  {
    nombre: "Escitalopram",
    clase: "ISRS",
    dosisHabitual: "10-20 mg/dia",
    notas: "Depresion y ansiedad.",
    presentaciones: ["tabletas de 10 mg", "tabletas de 20 mg", "gotas 20 mg/ml"]
  },
  {
    nombre: "Citalopram",
    clase: "ISRS",
    dosisHabitual: "20-40 mg/dia",
    notas: "Depresion; vigilar QT en dosis altas.",
    presentaciones: ["tabletas de 20 mg", "tabletas de 40 mg"]
  },
  {
    nombre: "Fluvoxamina",
    clase: "ISRS",
    dosisHabitual: "50-300 mg/dia",
    notas: "TOC, ansiedad; revisar interacciones.",
    presentaciones: ["tabletas de 50 mg", "tabletas de 100 mg"]
  },
  {
    nombre: "Venlafaxina",
    clase: "IRSN",
    dosisHabitual: "75-225 mg/dia",
    notas: "Vigilar presion arterial.",
    presentaciones: ["tabletas de 37.5 mg", "tabletas de 75 mg", "capsulas XR de 75 mg", "capsulas XR de 150 mg"]
  },
  {
    nombre: "Desvenlafaxina",
    clase: "IRSN",
    dosisHabitual: "50-100 mg/dia",
    notas: "Depresion; ajustar segun respuesta.",
    presentaciones: ["tabletas de liberacion prolongada de 50 mg", "tabletas de liberacion prolongada de 100 mg"]
  },
  {
    nombre: "Duloxetina",
    clase: "IRSN",
    dosisHabitual: "30-120 mg/dia",
    notas: "Depresion, ansiedad, dolor neuropatico.",
    presentaciones: ["capsulas de 30 mg", "capsulas de 60 mg"]
  },
  {
    nombre: "Bupropion",
    clase: "NDRI",
    dosisHabitual: "150-300 mg/dia",
    notas: "Evitar en epilepsia o TCA activos.",
    presentaciones: ["tabletas de liberacion prolongada de 150 mg", "tabletas de liberacion prolongada de 300 mg"]
  },
  {
    nombre: "Mirtazapina",
    clase: "NaSSA",
    dosisHabitual: "15-45 mg/noche",
    notas: "Util en insomnio o bajo peso.",
    presentaciones: ["tabletas de 15 mg", "tabletas de 30 mg", "tabletas de 45 mg", "tabletas orodispersables de 15 mg", "tabletas orodispersables de 30 mg"]
  },
  {
    nombre: "Trazodona",
    clase: "Antidepresivo modulador serotoninergico",
    dosisHabitual: "50-300 mg/dia",
    notas: "Frecuente uso nocturno por sedacion.",
    presentaciones: ["tabletas de 50 mg", "tabletas de 100 mg", "tabletas de 150 mg"]
  },
  {
    nombre: "Vortioxetina",
    clase: "Antidepresivo multimodal",
    dosisHabitual: "5-20 mg/dia",
    notas: "Depresion; vigilar nausea.",
    presentaciones: ["tabletas de 5 mg", "tabletas de 10 mg", "tabletas de 20 mg"]
  },
  {
    nombre: "Agomelatina",
    clase: "Antidepresivo melatoninergico",
    dosisHabitual: "25-50 mg/noche",
    notas: "Vigilar funcion hepatica.",
    presentaciones: ["tabletas de 25 mg"]
  },
  {
    nombre: "Amitriptilina",
    clase: "Triciclico",
    dosisHabitual: "25-150 mg/dia",
    notas: "Vigilar ECG y carga anticolinergica.",
    presentaciones: ["tabletas de 10 mg", "tabletas de 25 mg", "tabletas de 50 mg"]
  },
  {
    nombre: "Imipramina",
    clase: "Triciclico",
    dosisHabitual: "25-200 mg/dia",
    notas: "Vigilar efectos anticolinergicos y cardiacos.",
    presentaciones: ["tabletas de 10 mg", "tabletas de 25 mg"]
  },
  {
    nombre: "Clomipramina",
    clase: "Triciclico",
    dosisHabitual: "25-250 mg/dia",
    notas: "TOC; vigilar efectos anticolinergicos.",
    presentaciones: ["capsulas de 25 mg", "tabletas de liberacion prolongada de 75 mg"]
  },
  {
    nombre: "Risperidona",
    clase: "Antipsicotico atipico",
    dosisHabitual: "1-6 mg/dia",
    notas: "Vigilar prolactina y sintomas extrapiramidales.",
    presentaciones: ["tabletas de 1 mg", "tabletas de 2 mg", "tabletas de 3 mg", "solucion oral de 1 mg/ml", "inyectable de liberacion prolongada de 25 mg", "inyectable de liberacion prolongada de 37.5 mg", "inyectable de liberacion prolongada de 50 mg"]
  },
  {
    nombre: "Paliperidona",
    clase: "Antipsicotico atipico",
    dosisHabitual: "3-12 mg/dia o esquema depot",
    notas: "Vigilar prolactina, EPS y funcion renal.",
    presentaciones: ["tabletas de liberacion prolongada de 3 mg", "tabletas de liberacion prolongada de 6 mg", "tabletas de liberacion prolongada de 9 mg", "inyectable mensual de 50 mg", "inyectable mensual de 75 mg", "inyectable mensual de 100 mg", "inyectable mensual de 150 mg"]
  },
  {
    nombre: "Olanzapina",
    clase: "Antipsicotico atipico",
    dosisHabitual: "5-20 mg/dia",
    notas: "Vigilar peso, glucosa y lipidos.",
    presentaciones: ["tabletas de 5 mg", "tabletas de 10 mg", "tabletas de 15 mg", "tabletas de 20 mg", "tabletas orodispersables de 5 mg", "tabletas orodispersables de 10 mg", "frasco ampula IM de 10 mg"]
  },
  {
    nombre: "Quetiapina",
    clase: "Antipsicotico atipico",
    dosisHabitual: "50-800 mg/dia",
    notas: "Sedacion frecuente.",
    presentaciones: ["tabletas de 25 mg", "tabletas de 100 mg", "tabletas de 200 mg", "tabletas de 300 mg", "tabletas XR de 50 mg", "tabletas XR de 200 mg", "tabletas XR de 300 mg", "tabletas XR de 400 mg"]
  },
  {
    nombre: "Aripiprazol",
    clase: "Antipsicotico atipico",
    dosisHabitual: "5-30 mg/dia",
    notas: "Puede causar acatisia.",
    presentaciones: ["tabletas de 5 mg", "tabletas de 10 mg", "tabletas de 15 mg", "tabletas de 30 mg", "solucion oral de 1 mg/ml", "inyectable mensual de 300 mg", "inyectable mensual de 400 mg"]
  },
  {
    nombre: "Ziprasidona",
    clase: "Antipsicotico atipico",
    dosisHabitual: "40-160 mg/dia",
    notas: "Administrar con alimentos; vigilar QT.",
    presentaciones: ["capsulas de 20 mg", "capsulas de 40 mg", "capsulas de 60 mg", "capsulas de 80 mg", "frasco ampula IM de 20 mg"]
  },
  {
    nombre: "Clozapina",
    clase: "Antipsicotico atipico",
    dosisHabitual: "25-600 mg/dia",
    notas: "Requiere monitoreo hematologico.",
    presentaciones: ["tabletas de 25 mg", "tabletas de 100 mg"]
  },
  {
    nombre: "Amisulprida",
    clase: "Antipsicotico atipico",
    dosisHabitual: "50-800 mg/dia",
    notas: "Vigilar prolactina y QT.",
    presentaciones: ["tabletas de 50 mg", "tabletas de 200 mg", "tabletas de 400 mg"]
  },
  {
    nombre: "Lurasidona",
    clase: "Antipsicotico atipico",
    dosisHabitual: "20-120 mg/dia",
    notas: "Administrar con alimentos.",
    presentaciones: ["tabletas de 20 mg", "tabletas de 40 mg", "tabletas de 80 mg"]
  },
  {
    nombre: "Cariprazina",
    clase: "Antipsicotico atipico",
    dosisHabitual: "1.5-6 mg/dia",
    notas: "Vigilar acatisia e insomnio.",
    presentaciones: ["capsulas de 1.5 mg", "capsulas de 3 mg", "capsulas de 4.5 mg", "capsulas de 6 mg"]
  },
  {
    nombre: "Haloperidol",
    clase: "Antipsicotico tipico",
    dosisHabitual: "1-10 mg/dia",
    notas: "Vigilar EPS y QT.",
    presentaciones: ["tabletas de 5 mg", "gotas 2 mg/ml", "ampolletas de 5 mg/ml", "decanoato 50 mg/ml", "decanoato 100 mg/ml"]
  },
  {
    nombre: "Levomepromazina",
    clase: "Antipsicotico fenotiazinico",
    dosisHabitual: "25-300 mg/dia",
    notas: "Sedacion e hipotension.",
    presentaciones: ["tabletas de 25 mg", "tabletas de 100 mg", "gotas 40 mg/ml", "ampolletas de 25 mg/ml"]
  },
  {
    nombre: "Clorpromazina",
    clase: "Antipsicotico fenotiazinico",
    dosisHabitual: "25-800 mg/dia",
    notas: "Sedacion, hipotension y efectos anticolinergicos.",
    presentaciones: ["tabletas de 25 mg", "tabletas de 100 mg", "ampolletas de 25 mg/ml"]
  },
  {
    nombre: "Trifluoperazina",
    clase: "Antipsicotico tipico",
    dosisHabitual: "2-20 mg/dia",
    notas: "Vigilar sintomas extrapiramidales.",
    presentaciones: ["tabletas de 1 mg", "tabletas de 5 mg"]
  },
  {
    nombre: "Litio",
    clase: "Estabilizador del animo",
    dosisHabitual: "Segun niveles sericos",
    notas: "Vigilar renal, tiroidea y litemia.",
    presentaciones: ["tabletas de carbonato de litio de 300 mg", "tabletas de carbonato de litio de 450 mg"]
  },
  {
    nombre: "Valproato de magnesio",
    clase: "Estabilizador del animo",
    dosisHabitual: "500-2000 mg/dia",
    notas: "Vigilar PFH, plaquetas; teratogenicidad.",
    presentaciones: ["tabletas de 200 mg", "tabletas de 400 mg", "solucion oral de 200 mg/5 ml"]
  },
  {
    nombre: "Acido valproico",
    clase: "Estabilizador del animo",
    dosisHabitual: "500-2000 mg/dia",
    notas: "Vigilar PFH, plaquetas; teratogenicidad.",
    presentaciones: ["capsulas de 250 mg", "jarabe de 250 mg/5 ml"]
  },
  {
    nombre: "Lamotrigina",
    clase: "Estabilizador del animo",
    dosisHabitual: "25-200 mg/dia",
    notas: "Titulacion lenta; vigilar rash.",
    presentaciones: ["tabletas de 25 mg", "tabletas de 50 mg", "tabletas de 100 mg", "tabletas de 200 mg"]
  },
  {
    nombre: "Carbamazepina",
    clase: "Estabilizador del animo",
    dosisHabitual: "200-1200 mg/dia",
    notas: "Interacciones CYP; vigilar BH y sodio.",
    presentaciones: ["tabletas de 200 mg", "tabletas de liberacion prolongada de 200 mg", "suspension de 100 mg/5 ml"]
  },
  {
    nombre: "Oxcarbazepina",
    clase: "Estabilizador del animo",
    dosisHabitual: "300-1200 mg/dia",
    notas: "Vigilar sodio.",
    presentaciones: ["tabletas de 300 mg", "tabletas de 600 mg", "suspension de 300 mg/5 ml"]
  },
  {
    nombre: "Topiramato",
    clase: "Anticonvulsivo",
    dosisHabitual: "25-200 mg/dia",
    notas: "Vigilar cognicion, peso y litiasis.",
    presentaciones: ["tabletas de 25 mg", "tabletas de 50 mg", "tabletas de 100 mg"]
  },
  {
    nombre: "Gabapentina",
    clase: "Anticonvulsivo / ansiolitico coadyuvante",
    dosisHabitual: "300-1800 mg/dia",
    notas: "Dolor neuropatico, ansiedad coadyuvante.",
    presentaciones: ["capsulas de 300 mg", "capsulas de 400 mg", "tabletas de 600 mg", "tabletas de 800 mg"]
  },
  {
    nombre: "Pregabalina",
    clase: "Anticonvulsivo / ansiolitico coadyuvante",
    dosisHabitual: "75-300 mg/dia",
    notas: "Ansiedad, dolor neuropatico; vigilar sedacion.",
    presentaciones: ["capsulas de 75 mg", "capsulas de 150 mg", "capsulas de 300 mg"]
  },
  {
    nombre: "Clonazepam",
    clase: "Benzodiacepina",
    dosisHabitual: "0.25-2 mg/dia",
    notas: "Uso corto; riesgo de dependencia.",
    presentaciones: ["tabletas de 0.5 mg", "tabletas de 2 mg", "gotas 2.5 mg/ml"]
  },
  {
    nombre: "Lorazepam",
    clase: "Benzodiacepina",
    dosisHabitual: "0.5-3 mg/dia",
    notas: "Ansiedad aguda, catatonia; uso prudente.",
    presentaciones: ["tabletas de 1 mg", "tabletas de 2 mg", "ampolletas de 4 mg/ml"]
  },
  {
    nombre: "Alprazolam",
    clase: "Benzodiacepina",
    dosisHabitual: "0.25-2 mg/dia",
    notas: "Ansiedad; riesgo de dependencia.",
    presentaciones: ["tabletas de 0.25 mg", "tabletas de 0.5 mg", "tabletas de 1 mg", "tabletas XR de 0.5 mg", "tabletas XR de 1 mg", "tabletas XR de 2 mg"]
  },
  {
    nombre: "Diazepam",
    clase: "Benzodiacepina",
    dosisHabitual: "2-20 mg/dia",
    notas: "Ansiedad, abstinencia, crisis; vida media larga.",
    presentaciones: ["tabletas de 5 mg", "tabletas de 10 mg", "ampolletas de 10 mg/2 ml"]
  },
  {
    nombre: "Bromazepam",
    clase: "Benzodiacepina",
    dosisHabitual: "1.5-6 mg/dia",
    notas: "Ansiedad; uso prudente.",
    presentaciones: ["tabletas de 3 mg", "tabletas de 6 mg"]
  },
  {
    nombre: "Midazolam",
    clase: "Benzodiacepina",
    dosisHabitual: "Uso hospitalario segun indicacion",
    notas: "Sedacion; monitorizacion.",
    presentaciones: ["ampolletas de 5 mg/5 ml", "ampolletas de 15 mg/3 ml"]
  },
  {
    nombre: "Zolpidem",
    clase: "Hipnotico Z",
    dosisHabitual: "5-10 mg/noche",
    notas: "Insomnio; uso corto.",
    presentaciones: ["tabletas de 5 mg", "tabletas de 10 mg", "tabletas CR de 6.25 mg", "tabletas CR de 12.5 mg"]
  },
  {
    nombre: "Zopiclona",
    clase: "Hipnotico Z",
    dosisHabitual: "3.75-7.5 mg/noche",
    notas: "Insomnio; uso corto.",
    presentaciones: ["tabletas de 7.5 mg"]
  },
  {
    nombre: "Melatonina",
    clase: "Cronobiotico",
    dosisHabitual: "1-5 mg/noche",
    notas: "Trastornos del sueno; ajustar horario.",
    presentaciones: ["tabletas de 1 mg", "tabletas de 3 mg", "tabletas de 5 mg"]
  },
  {
    nombre: "Metilfenidato",
    clase: "Estimulante",
    dosisHabitual: "Segun formulacion",
    notas: "TDAH; vigilar PA, FC, apetito.",
    presentaciones: ["tabletas de 10 mg", "tabletas de liberacion prolongada de 18 mg", "tabletas de liberacion prolongada de 27 mg", "tabletas de liberacion prolongada de 36 mg", "tabletas de liberacion prolongada de 54 mg"]
  },
  {
    nombre: "Lisdexanfetamina",
    clase: "Estimulante",
    dosisHabitual: "30-70 mg/dia",
    notas: "TDAH; vigilar PA, FC, apetito.",
    presentaciones: ["capsulas de 30 mg", "capsulas de 50 mg", "capsulas de 70 mg"]
  },
  {
    nombre: "Atomoxetina",
    clase: "No estimulante TDAH",
    dosisHabitual: "40-100 mg/dia",
    notas: "Vigilar efectos GI y PA.",
    presentaciones: ["capsulas de 10 mg", "capsulas de 18 mg", "capsulas de 25 mg", "capsulas de 40 mg", "capsulas de 60 mg", "capsulas de 80 mg", "capsulas de 100 mg"]
  },
  {
    nombre: "Guanfacina",
    clase: "Agonista alfa-2A",
    dosisHabitual: "1-7 mg/dia",
    notas: "TDAH; vigilar somnolencia e hipotension.",
    presentaciones: ["tabletas de liberacion prolongada de 1 mg", "tabletas de liberacion prolongada de 2 mg", "tabletas de liberacion prolongada de 3 mg", "tabletas de liberacion prolongada de 4 mg"]
  },
  {
    nombre: "Propranolol",
    clase: "Betabloqueador",
    dosisHabitual: "10-120 mg/dia",
    notas: "Ansiedad somatica, acatisia, temblor; vigilar FC y PA.",
    presentaciones: ["tabletas de 10 mg", "tabletas de 40 mg", "tabletas de 80 mg"]
  },
  {
    nombre: "Biperideno",
    clase: "Anticolinergico",
    dosisHabitual: "2-8 mg/dia",
    notas: "Sintomas extrapiramidales; vigilar efectos anticolinergicos.",
    presentaciones: ["tabletas de 2 mg", "ampolletas de 5 mg/ml"]
  },
  {
    nombre: "Trihexifenidilo",
    clase: "Anticolinergico",
    dosisHabitual: "2-15 mg/dia",
    notas: "Sintomas extrapiramidales; vigilar cognicion.",
    presentaciones: ["tabletas de 2 mg", "tabletas de 5 mg"]
  },
  {
    nombre: "Buspirona",
    clase: "Ansiolitico no benzodiacepinico",
    dosisHabitual: "15-60 mg/dia",
    notas: "Ansiedad; inicio gradual.",
    presentaciones: ["tabletas de 5 mg", "tabletas de 10 mg"]
  },
  {
    nombre: "Hidroxicina",
    clase: "Antihistaminico ansiolitico",
    dosisHabitual: "25-100 mg/dia",
    notas: "Ansiedad, insomnio; sedacion.",
    presentaciones: ["tabletas de 10 mg", "tabletas de 25 mg", "jarabe de 10 mg/5 ml"]
  },
  {
    nombre: "Memantina",
    clase: "Antagonista NMDA",
    dosisHabitual: "10-20 mg/dia",
    notas: "Deterioro cognitivo; ajustar segun tolerancia.",
    presentaciones: ["tabletas de 10 mg", "tabletas de 20 mg", "gotas 10 mg/ml"]
  },
  {
    nombre: "Donepezilo",
    clase: "Inhibidor de acetilcolinesterasa",
    dosisHabitual: "5-10 mg/noche",
    notas: "Demencia; vigilar GI y bradicardia.",
    presentaciones: ["tabletas de 5 mg", "tabletas de 10 mg"]
  },
  {
    nombre: "Rivastigmina",
    clase: "Inhibidor de acetilcolinesterasa",
    dosisHabitual: "Segun formulacion",
    notas: "Demencia; vigilar GI.",
    presentaciones: ["capsulas de 1.5 mg", "capsulas de 3 mg", "capsulas de 4.5 mg", "capsulas de 6 mg", "parches de 4.6 mg/24 h", "parches de 9.5 mg/24 h"]
  },
  {
    nombre: "Naltrexona",
    clase: "Tratamiento de adicciones",
    dosisHabitual: "50 mg/dia",
    notas: "Alcohol/opioides; descartar opioides activos.",
    presentaciones: ["tabletas de 50 mg"]
  },
  {
    nombre: "Acamprosato",
    clase: "Tratamiento de adicciones",
    dosisHabitual: "666 mg cada 8 h",
    notas: "Alcohol; ajustar a funcion renal.",
    presentaciones: ["tabletas de 333 mg"]
  },
  {
    nombre: "Disulfiram",
    clase: "Tratamiento de adicciones",
    dosisHabitual: "250-500 mg/dia",
    notas: "Alcohol; requiere consentimiento y vigilancia.",
    presentaciones: ["tabletas de 250 mg", "tabletas de 500 mg"]
  },
  //AINES Y PARACETAMOL
  {
    nombre: "Paracetamol",
    clase: "analgesico",
    dosisHabitual: "500-1000 mg cada 6-8 horas",
    notas: "Analgesico y antipiretico; vigilar funcion hepatica.",
    presentaciones: ["tabletas de 500 mg", "tabletas de 1000 mg", "suspension oral de 160 mg/5 ml"]
  },
  
  {
    nombre: "Naproxeno", 
    clase: "AINE", 
    dosisHabitual: "250-500 mg cada 8-12 horas", 
    notas: "Analgesico y antiinflamatorio; vigilar funcion renal y gastrointestinal.", 
    presentaciones: ["tabletas de 250 mg", "tabletas de 500 mg", "suspension oral de 125 mg/5 ml"]
  },
  
  {
    nombre: "Ibuprofeno", 
    clase: "AINE", 
    dosisHabitual: "200-400 mg cada 6-8 horas", 
    notas: "Analgesico y antiinflamatorio; vigilar funcion renal y gastrointestinal.", 
    presentaciones: ["tabletas de 200 mg", "tabletas de 400 mg", "suspension oral de 100 mg/5 ml"]
  },

  {
    nombre: "Diclofenaco", 
    clase: "AINE", 
    dosisHabitual: "50-100 mg cada 8-12 horas", 
    notas: "Analgesico y antiinflamatorio; vigilar funcion renal y gastrointestinal.", 
    presentaciones: ["tabletas de 50 mg", "tabletas de 75 mg", "suspension oral de 25 mg/5 ml"]
  }       

];

function slugMedicamento(valor = "") {
  return normalizarNombreMedicamento(valor)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textoPresentacion(presentacion) {
  if (typeof presentacion === "string") return presentacion;
  return presentacion?.texto || presentacion?.presentationDescription || "";
}

function normalizarMedicamentoBase(medicamento, origen = "catalogo_legacy") {
  const id = medicamento.id || slugMedicamento(medicamento.nombre);
  const presentaciones = (medicamento.presentaciones || medicamento.formulations || [])
    .map((presentacion) => {
      const texto = textoPresentacion(presentacion);
      return texto
        ? (typeof presentacion === "string" ? { texto, via: "oral", activo: true } : { ...presentacion, texto })
        : null;
    })
    .filter(Boolean);

  return {
    id,
    nombre: medicamento.nombre || medicamento.genericName || "",
    genericName: medicamento.genericName || medicamento.nombre || "",
    clase: medicamento.clase || medicamento.therapeuticClasses?.[0] || "Medicamento",
    therapeuticClasses: medicamento.therapeuticClasses || [medicamento.clase || "Medicamento"],
    especialidades: medicamento.especialidades || medicamento.specialties || [],
    specialties: medicamento.specialties || medicamento.especialidades || [],
    brandNames: medicamento.brandNames || medicamento.marcas || [],
    synonyms: medicamento.synonyms || medicamento.sinonimos || [],
    presentaciones,
    formulations: medicamento.formulations || presentaciones.map((presentacion, index) => ({
      id: `${id}-p${index + 1}`,
      presentationDescription: presentacion.texto,
      route: presentacion.via || "oral",
      active: presentacion.activo !== false
    })),
    dosisHabitual: medicamento.dosisHabitual || medicamento.adultDosing?.[0]?.usualDose?.text || "Consultar ficha técnica",
    adultDosing: medicamento.adultDosing || [{
      indicationId: "uso_habitual",
      population: "adult",
      usualDose: { text: medicamento.dosisHabitual || "Consultar ficha técnica" },
      administrationNotes: []
    }],
    pediatricDosing: medicamento.pediatricDosing || [],
    indications: medicamento.indications || [],
    contraindications: medicamento.contraindications || [],
    precautions: medicamento.precautions || medicamento.warnings || [],
    warnings: medicamento.warnings || medicamento.precautions || [],
    monitoring: medicamento.monitoring || [],
    interactions: medicamento.interactions || [],
    mecanismoAccion: medicamento.mecanismoAccion || medicamento.mechanismOfAction || "",
    vidaMedia: medicamento.vidaMedia || medicamento.halfLife || "",
    efectosAdversos: medicamento.efectosAdversos || medicamento.adverseEffects || [],
    notas: medicamento.notas || "",
    references: medicamento.references || ["Validar contra ficha técnica institucional vigente."],
    active: medicamento.active !== false,
    origen
  };
}

function unirMedicamentos(medicamentos) {
  const indice = new Map();

  medicamentos
    .map((medicamento) => normalizarMedicamentoBase(medicamento, medicamento.origen || "catalogo"))
    .filter((medicamento) => medicamento.nombre)
    .forEach((medicamento) => {
      const clave = normalizarNombreMedicamento(medicamento.nombre);
      if (!indice.has(clave)) {
        indice.set(clave, medicamento);
        return;
      }

      const existente = indice.get(clave);
      const presentaciones = [...existente.presentaciones];
      medicamento.presentaciones.forEach((presentacion) => {
        const texto = normalizarNombreMedicamento(presentacion.texto);
        if (!presentaciones.some((item) => normalizarNombreMedicamento(item.texto) === texto)) {
          presentaciones.push(presentacion);
        }
      });

      const formulaciones = [...(existente.formulations || []), ...(medicamento.formulations || [])]
        .filter((formulacion, index, lista) => {
          const claveFormulacion = [
            normalizarNombreMedicamento(formulacion.presentationDescription || formulacion.texto || ""),
            normalizarNombreMedicamento(formulacion.route || formulacion.via || "")
          ].join("|");
          return lista.findIndex((item) => [
            normalizarNombreMedicamento(item.presentationDescription || item.texto || ""),
            normalizarNombreMedicamento(item.route || item.via || "")
          ].join("|") === claveFormulacion) === index;
        })
        .map((formulacion, index) => ({
          ...formulacion,
          id: `${existente.id}-p${index + 1}`
        }));

      indice.set(clave, {
        ...existente,
        ...medicamento,
        id: existente.id,
        nombre: existente.nombre,
        genericName: existente.genericName || medicamento.genericName,
        clase: existente.clase || medicamento.clase,
        presentaciones,
        formulations: formulaciones,
        brandNames: Array.from(new Set([...(existente.brandNames || []), ...(medicamento.brandNames || [])])),
        synonyms: Array.from(new Set([...(existente.synonyms || []), ...(medicamento.synonyms || [])])),
        especialidades: Array.from(new Set([...(existente.especialidades || []), ...(medicamento.especialidades || [])])),
        specialties: Array.from(new Set([...(existente.specialties || []), ...(medicamento.specialties || [])])),
        indications: Array.from(new Set([...(existente.indications || []), ...(medicamento.indications || [])])),
        contraindications: Array.from(new Set([...(existente.contraindications || []), ...(medicamento.contraindications || [])])),
        precautions: Array.from(new Set([...(existente.precautions || []), ...(medicamento.precautions || [])])),
        monitoring: Array.from(new Set([...(existente.monitoring || []), ...(medicamento.monitoring || [])])),
        interactions: Array.from(new Set([...(existente.interactions || []), ...(medicamento.interactions || [])]))
      });
    });

  return Array.from(indice.values())
    .filter((medicamento) => medicamento.active)
    .map(enriquecerMedicamentoClinico)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function normalizarNombreMedicamento(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function textoMedicamentoParaBusqueda(medicamento) {
  return [
    medicamento.nombre,
    medicamento.genericName,
    medicamento.clase,
    ...(medicamento.therapeuticClasses || []),
    ...(medicamento.especialidades || []),
    ...(medicamento.brandNames || []),
    ...(medicamento.synonyms || []),
    ...(medicamento.presentaciones || []).map((presentacion) => presentacion.texto),
    medicamento.dosisHabitual,
    medicamento.mecanismoAccion,
    medicamento.vidaMedia,
    ...(medicamento.indicaciones || medicamento.indications || []),
    ...(medicamento.contraindicaciones || medicamento.contraindications || []),
    ...(medicamento.precauciones || medicamento.precautions || []),
    ...(medicamento.efectosAdversos || []),
    medicamento.notas
  ].flat().filter(Boolean).join(" ");
}

function normalizarBusquedaMedicamento(valor = "") {
  return normalizarNombreMedicamento(valor).replace(/[^a-z0-9]+/g, " ");
}

export const MEDICAMENTOS_MAESTROS = construirCapaFarmacologicaUnificada(unirMedicamentos([
  ...MEDICAMENTOS.map((medicamento) => ({ ...medicamento, origen: "catalogo_legacy" })),
  ...MEDICAMENTOS_SUPLEMENTARIOS.map((medicamento) => ({ ...medicamento, origen: "catalogo_suplementario" }))
]));

export const COBERTURA_FARMACOLOGICA = resumirCoberturaFarmacologica(MEDICAMENTOS_MAESTROS);

export const MEDICAMENTOS_PRESENTACIONES = MEDICAMENTOS_MAESTROS.flatMap((medicamento) => {
  const presentaciones = medicamento.presentaciones?.length
    ? medicamento.presentaciones
    : [{ texto: "presentación no especificada", via: "" }];

  return presentaciones.map((presentacion) => ({
    ...medicamento,
    presentacion: presentacion.texto,
    via: presentacion.via || "",
    texto: `${medicamento.nombre}, ${presentacion.texto}.`
  }));
});

export function buscarMedicamentos(query = "", opciones = {}) {
  const limite = opciones.limit || 40;
  const filtro = normalizarNombreMedicamento(query);
  const filtroFlexible = normalizarBusquedaMedicamento(query);
  const resultados = filtro
    ? MEDICAMENTOS_MAESTROS.filter((medicamento) =>
      normalizarNombreMedicamento(textoMedicamentoParaBusqueda(medicamento)).includes(filtro) ||
      normalizarBusquedaMedicamento(textoMedicamentoParaBusqueda(medicamento)).includes(filtroFlexible)
    )
    : MEDICAMENTOS_MAESTROS;

  return resultados.slice(0, limite);
}

export function medicamentoPorTexto(texto = "") {
  const normalizado = normalizarNombreMedicamento(texto);
  return MEDICAMENTOS_MAESTROS.find((medicamento) =>
    normalizado.includes(normalizarNombreMedicamento(medicamento.nombre)) ||
    (medicamento.brandNames || []).some((marca) => normalizado.includes(normalizarNombreMedicamento(marca)))
  ) || null;
}
