function crearSustancias(categoria, sustancias) {
  return sustancias.map(([id, nombre]) => ({ id, nombre, categoria, activo: true }));
}

export const CATEGORIAS_SUSTANCIAS = Object.freeze([
  { id: "alcohol", nombre: "Alcohol" },
  { id: "nicotina-tabaco", nombre: "Nicotina y tabaco" },
  { id: "cannabis-cannabinoides", nombre: "Cannabis y cannabinoides" },
  { id: "estimulantes", nombre: "Estimulantes" },
  { id: "opioides", nombre: "Opioides" },
  { id: "sedantes-hipnoticos-ansioliticos", nombre: "Sedantes, hipnóticos y ansiolíticos" },
  { id: "alucinogenos-psicodelicos", nombre: "Alucinógenos y psicodélicos" },
  { id: "disociativos", nombre: "Disociativos" },
  { id: "inhalables", nombre: "Inhalables" },
  { id: "nuevas-sustancias-psicoactivas", nombre: "Nuevas sustancias psicoactivas" },
  { id: "uso-medico-sin-indicacion", nombre: "Sustancias de uso médico sin indicación" },
  { id: "esteroides-rendimiento", nombre: "Esteroides y rendimiento" },
  { id: "otras", nombre: "Otras" }
]);

export const CATALOGO_SUSTANCIAS = Object.freeze([
  ...crearSustancias("alcohol", [["alcohol", "Alcohol"]]),
  ...crearSustancias("nicotina-tabaco", [
    ["cigarrillos", "Cigarrillos"], ["tabaco-puro-pipa", "Tabaco puro o pipa"],
    ["tabaco-mascado", "Tabaco mascado"], ["vapeadores-nicotina", "Vapeadores con nicotina"],
    ["pouches-nicotina", "Pouches o bolsas de nicotina"]
  ]),
  ...crearSustancias("cannabis-cannabinoides", [
    ["cannabis", "Cannabis o marihuana"], ["hachis", "Hachís"], ["concentrados-cannabis", "Concentrados de cannabis"],
    ["cannabis-sintetico", "Cannabis sintético"], ["thc-comestibles", "THC en comestibles"],
    ["cbd-no-medico", "CBD con uso no médico o composición desconocida"]
  ]),
  ...crearSustancias("estimulantes", [
    ["cocaina", "Cocaína"], ["crack", "Crack"], ["pasta-base", "Pasta base"], ["anfetaminas", "Anfetaminas"],
    ["metanfetamina", "Metanfetamina"], ["mdma", "MDMA o éxtasis"], ["mefedrona", "Mefedrona"],
    ["catinonas-sinteticas", "Catinonas sintéticas"], ["metilfenidato-no-medico", "Metilfenidato sin indicación médica"],
    ["lisdexanfetamina-no-medica", "Lisdexanfetamina sin indicación médica"],
    ["otros-estimulantes-prescripcion", "Otros estimulantes de prescripción usados sin indicación"]
  ]),
  ...crearSustancias("opioides", [
    ["heroina", "Heroína"], ["opio", "Opio"], ["morfina-no-medica", "Morfina sin indicación médica"],
    ["codeina-no-medica", "Codeína sin indicación médica"], ["tramadol-no-medico", "Tramadol sin indicación médica"],
    ["oxicodona-no-medica", "Oxicodona sin indicación médica"], ["hidrocodona-no-medica", "Hidrocodona sin indicación médica"],
    ["fentanilo-no-medico", "Fentanilo ilícito o sin indicación médica"], ["buprenorfina-no-medica", "Buprenorfina sin indicación médica"],
    ["metadona-no-medica", "Metadona sin indicación médica"], ["otros-opioides", "Otros opioides"]
  ]),
  ...crearSustancias("sedantes-hipnoticos-ansioliticos", [
    ["benzodiacepinas", "Benzodiacepinas"], ["alprazolam-no-medico", "Alprazolam sin indicación médica"],
    ["clonazepam-no-medico", "Clonazepam sin indicación médica"], ["diazepam-no-medico", "Diazepam sin indicación médica"],
    ["lorazepam-no-medico", "Lorazepam sin indicación médica"], ["midazolam-no-medico", "Midazolam sin indicación médica"],
    ["barbituricos", "Barbitúricos"], ["zolpidem-no-medico", "Zolpidem y otros hipnóticos Z sin indicación médica"],
    ["gabapentina-no-medica", "Gabapentina sin indicación médica"], ["pregabalina-no-medica", "Pregabalina sin indicación médica"],
    ["otros-sedantes", "Otros sedantes"]
  ]),
  ...crearSustancias("alucinogenos-psicodelicos", [
    ["lsd", "LSD"], ["psilocibina", "Psilocibina u hongos"], ["mescalina-peyote", "Mescalina o peyote"],
    ["dmt", "DMT"], ["ayahuasca", "Ayahuasca"], ["salvia-divinorum", "Salvia divinorum"], ["otros-alucinogenos", "Otros alucinógenos"]
  ]),
  ...crearSustancias("disociativos", [
    ["ketamina", "Ketamina"], ["pcp", "Fenciclidina o PCP"], ["dextrometorfano-recreativo", "Dextrometorfano con uso recreativo"],
    ["oxido-nitroso", "Óxido nitroso"], ["otros-disociativos", "Otros disociativos"]
  ]),
  ...crearSustancias("inhalables", [
    ["thinner", "Thinner"], ["pegamentos", "Pegamentos"], ["gasolina", "Gasolina"], ["aerosoles", "Aerosoles"],
    ["solventes", "Solventes"], ["tolueno", "Tolueno"], ["gas-butano", "Gas butano"], ["nitritos-poppers", "Nitritos inhalados o poppers"],
    ["otros-inhalables", "Otros inhalables"]
  ]),
  ...crearSustancias("nuevas-sustancias-psicoactivas", [
    ["fenetilaminas-sinteticas", "Fenetilaminas sintéticas"], ["nbome", "NBOMe"], ["benzofuranos", "Benzofuranos"],
    ["opioides-sinteticos-no-farmaceuticos", "Opioides sintéticos no farmacéuticos"], ["benzodiacepinas-diseno", "Benzodiacepinas de diseño"],
    ["otras-nuevas-psicoactivas", "Otras nuevas sustancias psicoactivas"]
  ]),
  ...crearSustancias("uso-medico-sin-indicacion", [
    ["anticolinergicos", "Anticolinérgicos"], ["antihistaminicos-recreativos", "Antihistamínicos con fines recreativos"],
    ["jarabes-dextrometorfano", "Jarabes con dextrometorfano"], ["estimulantes-prescritos", "Estimulantes prescritos"],
    ["sedantes-prescritos", "Sedantes prescritos"], ["opioides-prescritos", "Analgésicos opioides prescritos"],
    ["anestesicos", "Anestésicos"], ["otros-medicamentos-no-indicados", "Otros medicamentos utilizados sin indicación"]
  ]),
  ...crearSustancias("esteroides-rendimiento", [
    ["esteroides-anabolicos", "Esteroides anabólico-androgénicos"], ["hormona-crecimiento", "Hormona de crecimiento"],
    ["otras-sustancias-rendimiento", "Otras sustancias para mejorar rendimiento o imagen corporal"]
  ]),
  ...crearSustancias("otras", [
    ["cafeina-problematica", "Cafeína en consumo problemático"], ["bebidas-energeticas-problematicas", "Bebidas energéticas en consumo problemático"],
    ["sustancia-desconocida", "Sustancia desconocida"], ["otra-sustancia", "Otra sustancia"]
  ])
]);

export const SUSTANCIAS_POR_ID = Object.freeze(
  Object.fromEntries(CATALOGO_SUSTANCIAS.map((sustancia) => [sustancia.id, sustancia]))
);

export const CATEGORIAS_SUSTANCIAS_POR_ID = Object.freeze(
  Object.fromEntries(CATEGORIAS_SUSTANCIAS.map((categoria) => [categoria.id, categoria]))
);
