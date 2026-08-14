import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = resolve(SCRIPT_DIR, "..");
const CATALOG_PATH = resolve(REPO_DIR, "js/data/catalogoDiagnosticos.js");
const INPUT_PATH = process.argv[2]
  || "C:/Users/980027131/AppData/Local/Temp/cognicion-cie10-c-20260813/official-cd.json";

const CLINICAL_SOURCES = {
  who: "https://icd.who.int/browse10/2019/en",
  metadata: "https://icdcdn.who.int/icd10/meta/icd102019enMeta.zip",
  paho2: "https://ais.paho.org/classifications/Chapters/CAP02.html",
  paho3: "https://ais.paho.org/classifications/Chapters/CAP03.html",
  spanishVolume: "https://repositoriodeis.minsal.cl/ContenidoSitioWeb2020/uploads/2020/12/CIE-10_2018_VOL1.pdf",
  cancerDiagnosis: "https://www.cancer.gov/about-cancer/diagnosis-staging/diagnosis",
  cancerTreatment: "https://www.cancer.gov/about-cancer/treatment/types",
  cancerPrognosis: "https://www.cancer.gov/about-cancer/diagnosis-staging/prognosis",
  anemiaDiagnosis: "https://www.nhlbi.nih.gov/health/anemia/diagnosis",
  anemiaTreatment: "https://www.nhlbi.nih.gov/health/anemia/treatment",
  bleedingDiagnosis: "https://www.nhlbi.nih.gov/health/bleeding-disorders/diagnosis",
  bleedingTreatment: "https://www.nhlbi.nih.gov/health/bleeding-disorders/treatment",
  immuneDisorders: "https://medlineplus.gov/ency/article/000818.htm",
  niaidPidd: "https://data.niaid.nih.gov/diseases/primary-immune-deficiency-diseases-pid-ds"
};

const C_BASE = {
  definicionClinica: "Neoplasia maligna definida por proliferación celular invasiva con capacidad potencial de diseminación. La CIE-10 identifica principalmente el sitio anatómico; la morfología, el grado, los biomarcadores y el estadio deben documentarse por separado.",
  etiologia: "Multifactorial. Puede intervenir la acumulación de alteraciones somáticas o hereditarias, exposiciones ambientales u ocupacionales, hábitos, radiación, inflamación crónica, inmunosupresión o agentes oncogénicos; el peso de cada factor depende del tumor concreto.",
  agenteCausal: "No existe un agente causal único inferible del código. Cuando se sospeche una infección o exposición carcinógena concreta debe demostrarse y registrarse por separado.",
  epidemiologia: "La frecuencia varía ampliamente por sitio, edad, sexo, región y factores de riesgo. El código CIE-10 no aporta incidencia individual ni sustituye datos epidemiológicos locales.",
  manifestacionesClinicas: "Dependen del órgano de origen y de la extensión. Pueden incluir masa, dolor, sangrado, obstrucción, pérdida de peso, síntomas constitucionales o hallazgos incidentales; la ausencia de síntomas no excluye enfermedad.",
  criteriosDiagnosticos: "No existe un criterio clínico único para todo el grupo. La confirmación suele requerir integración de historia y exploración con anatomía patológica o citología cuando sea factible, además de clasificación de extensión, grado y biomarcadores según el tumor.",
  laboratoriosRecomendados: "Biometría hemática y perfiles metabólico, renal y hepático como evaluación basal; pruebas dirigidas por órgano, comorbilidad y tratamiento. Los marcadores tumorales aislados no confirman ni excluyen cáncer.",
  estudiosImagen: "Imagen anatómica o funcional seleccionada por sitio y pregunta clínica, por ejemplo ultrasonido, radiografía, TC, RM o PET/TC. Debe evitarse solicitar modalidades indiscriminadas sin una indicación de detección, caracterización, estadificación o seguimiento.",
  diagnosticoDiferencial: "Lesiones benignas, inflamatorias, infecciosas, traumáticas o premalignas del mismo sitio, además de metástasis desde otro primario. La diferenciación depende de contexto, imagen y patología.",
  complicaciones: "Invasión local, obstrucción o sangrado, dolor, infección, deterioro nutricional o funcional, trombosis, metástasis, recurrencia y toxicidad relacionada con el tratamiento.",
  tratamientoInicial: "Confirmar diagnóstico y extensión, tratar urgencias oncológicas, controlar síntomas, revisar estado funcional y comorbilidades, y derivar al equipo oncológico correspondiente.",
  tratamientoEspecifico: "Puede incluir cirugía, radioterapia, tratamiento sistémico citotóxico, endocrino, dirigido o inmunoterapia, así como cuidados paliativos. La combinación depende del sitio, histología, biomarcadores, estadio y objetivos; el código CIE-10 por sí solo nunca define un esquema.",
  prevencion: "Reducir exposiciones modificables, aplicar vacunación y control de infecciones oncogénicas cuando correspondan, y realizar tamizaje solo con programas y criterios validados para edad y riesgo.",
  pronostico: "Depende del sitio primario, histología, biología molecular, estadio, respuesta, estado funcional y acceso al tratamiento. No puede estimarse a partir del código aislado.",
  exclusiones: "Distinguir tumor primario de metástasis, comportamiento maligno de in situ, benigno o incierto, y revisar inclusiones, exclusiones y reglas de sitios contiguos de la lista tabular OMS. Para morfología oncológica se requiere CIE-O cuando proceda.",
  fuentesClinicas: [CLINICAL_SOURCES.cancerDiagnosis, CLINICAL_SOURCES.cancerTreatment, CLINICAL_SOURCES.cancerPrognosis]
};

const PROFILES = {
  C00_C14: {
    ...C_BASE,
    manifestacionesClinicas: "Lesión o masa en labio, boca, glándula salival o faringe; dolor, úlcera persistente, sangrado, disfagia, odinofagia, cambio de voz, otalgia referida o adenopatía cervical. La presentación depende del subsitio.",
    laboratoriosRecomendados: "Biometría hemática y función renal, hepática y nutricional antes de tratamiento; pruebas dirigidas por comorbilidad. HPV o EBV se estudian solo en tumores y escenarios donde cambien clasificación o manejo.",
    estudiosImagen: "Exploración endoscópica y TC o RM de cabeza y cuello según el sitio; imagen torácica y PET/TC en estadificación seleccionada. La biopsia establece histología.",
    diagnosticoDiferencial: "Úlcera traumática, infección, lesión dental, sialadenitis, tumor benigno, quiste y lesión premaligna del mismo sitio.",
    complicaciones: "Compromiso de vía aérea, deglución o habla, desnutrición, sangrado, invasión perineural, adenopatías y metástasis."
  },
  C15_C26: {
    ...C_BASE,
    manifestacionesClinicas: "Disfagia, dolor o sangrado digestivo, anemia, cambio del hábito intestinal, obstrucción, ictericia, masa, pérdida de peso o hallazgo incidental, según el órgano digestivo.",
    laboratoriosRecomendados: "Biometría hemática, función renal y hepática, electrólitos y evaluación nutricional; pruebas pancreatobiliares o marcadores solo como apoyo y seguimiento cuando estén indicados.",
    estudiosImagen: "Endoscopia con biopsia cuando el órgano es accesible; ultrasonido, TC o RM con protocolos del sitio y, en casos seleccionados, ultrasonido endoscópico o PET/TC.",
    diagnosticoDiferencial: "Enfermedad ulcerosa o inflamatoria, infección, pólipo, estenosis benigna, litiasis, pancreatitis, hepatopatía y tumores benignos.",
    complicaciones: "Hemorragia, obstrucción o perforación, ictericia, ascitis, malabsorción o desnutrición, insuficiencia orgánica y metástasis."
  },
  C30_C39: {
    ...C_BASE,
    manifestacionesClinicas: "Obstrucción nasal, epistaxis, tos persistente, hemoptisis, disnea, dolor torácico, ronquera, neumonía recurrente, derrame o síntomas por compresión intratorácica.",
    laboratoriosRecomendados: "Biometría hemática, función renal y hepática y evaluación respiratoria basal; gases o pruebas funcionales respiratorias cuando la situación clínica o el tratamiento lo requieran.",
    estudiosImagen: "TC de tórax o región afectada; RM para extensión local seleccionada, broncoscopia o endoscopia con toma de muestra y PET/TC cuando contribuya a estadificar.",
    diagnosticoDiferencial: "Infección, enfermedad inflamatoria, nódulo benigno, atelectasia, tromboembolia, lesión vascular y metástasis desde otro primario.",
    complicaciones: "Obstrucción de vía aérea, hemorragia, insuficiencia respiratoria, derrame, síndrome de vena cava superior, invasión mediastinal y metástasis."
  },
  C40_C41: {
    ...C_BASE,
    manifestacionesClinicas: "Dolor óseo persistente, masa, limitación funcional o fractura patológica; en localización axial puede haber compresión neurológica.",
    laboratoriosRecomendados: "Biometría hemática, función renal y hepática, calcio y fosfatasa alcalina como evaluación basal; ninguna prueba aislada confirma malignidad ósea.",
    estudiosImagen: "Radiografía inicial del sitio, RM para extensión local y relación neurovascular, TC para cortical o tórax y estudios de extensión según histología.",
    diagnosticoDiferencial: "Traumatismo, osteomielitis, infarto óseo, lesión benigna, enfermedad metabólica y metástasis ósea.",
    complicaciones: "Fractura, dolor, pérdida funcional, compresión neurovascular y metástasis, especialmente pulmonar según histología."
  },
  C43: {
    ...C_BASE,
    manifestacionesClinicas: "Lesión pigmentada nueva o cambiante, asimétrica, de bordes o color irregulares, sangrado o nódulo; también puede ser amelanótica.",
    criteriosDiagnosticos: "La sospecha clínica y dermatoscópica requiere confirmación histopatológica, habitualmente mediante biopsia excisional cuando sea apropiada; documentar espesor y otros factores patológicos para estadificación.",
    laboratoriosRecomendados: "No existe análisis sanguíneo de detección o confirmación. Solicitar estudios basales y biomarcadores moleculares solo cuando cambien tratamiento o seguimiento.",
    estudiosImagen: "No siempre se requiere imagen en enfermedad localizada temprana; usar ultrasonido ganglionar, TC, RM cerebral o PET/TC según estadio y síntomas.",
    diagnosticoDiferencial: "Nevus melanocítico, queratosis seborreica, lesión vascular, carcinoma pigmentado y otras lesiones cutáneas.",
    complicaciones: "Ulceración, compromiso ganglionar, metástasis visceral o cerebral y recurrencia."
  },
  C44: {
    ...C_BASE,
    manifestacionesClinicas: "Pápula, placa o úlcera que crece, sangra o no cicatriza en piel; el aspecto depende del subtipo y la localización.",
    criteriosDiagnosticos: "La exploración identifica la lesión sospechosa y la biopsia confirma tipo histológico y factores de riesgo. La extensión clínica y patológica orienta el manejo.",
    laboratoriosRecomendados: "No hay laboratorio diagnóstico rutinario; solicitar estudios basales solo por comorbilidad, extensión o tratamiento.",
    estudiosImagen: "Generalmente innecesaria en lesiones pequeñas; TC o RM si se sospecha invasión profunda, perineural, ósea o ganglionar.",
    diagnosticoDiferencial: "Queratosis actínica o seborreica, dermatitis, infección, úlcera crónica, tumor benigno y melanoma.",
    complicaciones: "Destrucción local, invasión perineural, recurrencia y, en subtipos de alto riesgo, metástasis."
  },
  C45_C49: {
    ...C_BASE,
    manifestacionesClinicas: "Masa de crecimiento progresivo, dolor o déficit por compresión; en mesotelioma puede predominar disnea, dolor y derrame. Los sarcomas profundos pueden ser inicialmente indoloros.",
    laboratoriosRecomendados: "Biometría hemática y función orgánica basal; no existe marcador sérico universal. Patología con inmunohistoquímica y estudios moleculares puede ser necesaria.",
    estudiosImagen: "RM para extremidades o pelvis y TC para tórax, retroperitoneo o extensión; la biopsia debe planearse con el equipo que realizará el tratamiento definitivo.",
    diagnosticoDiferencial: "Lipoma u otro tumor benigno, hematoma, absceso, fibrosis, lesión metastásica y enfermedad inflamatoria.",
    complicaciones: "Compresión neurovascular o visceral, derrame, recurrencia local y metástasis hematógena."
  },
  C50: {
    ...C_BASE,
    manifestacionesClinicas: "Masa mamaria, cambio cutáneo o del pezón, secreción, retracción o adenopatía; también puede detectarse por imagen antes de causar síntomas.",
    criteriosDiagnosticos: "La evaluación integra exploración e imagen mamaria con biopsia. Anatomía patológica, receptores hormonales, HER2 y otros biomarcadores indicados orientan clasificación y tratamiento.",
    laboratoriosRecomendados: "Biometría hemática y función renal y hepática basales; pruebas germinales o biomarcadores solo según edad, antecedentes, subtipo y consecuencias clínicas.",
    estudiosImagen: "Mastografía y ultrasonido dirigidos; RM mamaria o estudios de extensión según riesgo, hallazgos y estadio.",
    diagnosticoDiferencial: "Quiste, fibroadenoma, mastitis, necrosis grasa, papiloma, cambios fibrocísticos y carcinoma in situ.",
    complicaciones: "Ulceración, linfedema, compromiso ganglionar, metástasis ósea o visceral, recurrencia y efectos del tratamiento."
  },
  C51_C58: {
    ...C_BASE,
    manifestacionesClinicas: "Sangrado o secreción anormal, dolor pélvico, masa, distensión, prurito o lesión genital, síntomas urinarios o intestinales; algunos tumores se detectan por tamizaje validado.",
    laboratoriosRecomendados: "Biometría hemática, función renal y hepática; prueba de embarazo cuando proceda y marcadores únicamente en tumores y contextos específicos.",
    estudiosImagen: "Exploración ginecológica y biopsia; ultrasonido pélvico, TC o RM según órgano y extensión, con PET/TC en situaciones seleccionadas.",
    diagnosticoDiferencial: "Infección, endometriosis, mioma, quiste, pólipo, lesión benigna o premaligna y embarazo.",
    complicaciones: "Hemorragia, obstrucción urinaria o intestinal, fístula, dolor, ascitis, trombosis, infertilidad y metástasis."
  },
  C60_C63: {
    ...C_BASE,
    manifestacionesClinicas: "Lesión genital, masa testicular, síntomas prostáticos o urinarios, dolor, hematuria o hallazgo incidental; la presentación depende del órgano.",
    laboratoriosRecomendados: "Biometría hemática y función renal y hepática; PSA o marcadores de tumor germinal solo en el contexto clínico correspondiente y nunca como confirmación aislada.",
    estudiosImagen: "Ultrasonido, RM o TC dirigidos por órgano; biopsia según el sitio y estudios de extensión por histología y estadio.",
    diagnosticoDiferencial: "Infección, hiperplasia, hidrocele, torsión, quiste, tumor benigno y lesión inflamatoria.",
    complicaciones: "Obstrucción urinaria, sangrado, dolor, infertilidad, compromiso ganglionar y metástasis ósea o visceral."
  },
  C64_C68: {
    ...C_BASE,
    manifestacionesClinicas: "Hematuria, dolor en flanco, masa, síntomas irritativos u obstructivos urinarios, deterioro renal o hallazgo incidental.",
    laboratoriosRecomendados: "EGO, biometría hemática, creatinina y función renal y hepática; citología urinaria cuando sea apropiada al sitio.",
    estudiosImagen: "Ultrasonido o urotomografía/TC con protocolo, RM si está indicada y cistoscopia o ureteroscopia con toma de muestra para lesiones uroteliales.",
    diagnosticoDiferencial: "Litiasis, infección, quiste, glomerulopatía, hiperplasia, tumor benigno y sangrado por fármacos.",
    complicaciones: "Obstrucción, hidronefrosis, hemorragia, insuficiencia renal, invasión vascular y metástasis."
  },
  C69_C72: {
    ...C_BASE,
    manifestacionesClinicas: "Alteración visual, cefalea, convulsión, déficit focal, cambios cognitivos o endocrinos, dolor radicular o signos de hipertensión intracraneal; varía con la localización.",
    criteriosDiagnosticos: "La evaluación neurológica u oftalmológica y la neuroimagen localizan la lesión. La confirmación histológica o molecular se obtiene cuando es segura y modifica manejo; algunos escenarios se diagnostican de forma clínico-radiológica especializada.",
    laboratoriosRecomendados: "Biometría hemática, función metabólica y pruebas endocrinas o de líquido cefalorraquídeo solo cuando estén indicadas y sean seguras. Los marcadores séricos no sustituyen imagen ni patología.",
    estudiosImagen: "RM con contraste es central para encéfalo, médula, nervios craneales u órbita; TC se usa en urgencias, hueso o cuando RM no es posible. Otros estudios dependen de la sospecha.",
    diagnosticoDiferencial: "Lesión vascular, infección, inflamación o desmielinización, absceso, tumor benigno, metástasis y trastorno oftalmológico no tumoral.",
    complicaciones: "Convulsiones, edema e hipertensión intracraneal, hidrocefalia, pérdida visual, déficit neurológico, compresión medular y discapacidad."
  },
  C73_C75: {
    ...C_BASE,
    manifestacionesClinicas: "Masa o síntomas compresivos y, en algunos tumores, exceso o déficit hormonal; otros son hallazgos incidentales.",
    laboratoriosRecomendados: "Perfil hormonal dirigido al órgano antes de biopsias o cirugía cuando corresponda, además de biometría y función metabólica. Los marcadores se interpretan en contexto.",
    estudiosImagen: "Ultrasonido para tiroides y paratiroides; TC o RM para extensión o glándulas profundas; imagen funcional únicamente con indicación específica.",
    diagnosticoDiferencial: "Bocio o nódulo benigno, adenoma funcional, quiste, hiperplasia, tiroiditis y metástasis.",
    complicaciones: "Compresión de vía aérea o estructuras vecinas, crisis hormonales, alteraciones metabólicas, recurrencia y metástasis."
  },
  C76_C80: {
    ...C_BASE,
    definicionClinica: "Neoplasia maligna de sitio mal definido, secundario o primario desconocido. Debe conservarse la distinción entre un primario no identificado y una metástasis cuyo origen sí se conoce.",
    manifestacionesClinicas: "Dependen del órgano comprometido y de la carga tumoral; pueden predominar masa, dolor, pérdida de peso, derrame, déficit funcional o síntomas del sitio metastásico.",
    criteriosDiagnosticos: "Confirmar malignidad y determinar, hasta donde sea clínicamente útil, histología, inmunofenotipo, biomarcadores y extensión. La búsqueda del primario debe ser dirigida y no repetirse sin impacto esperado en el manejo.",
    laboratoriosRecomendados: "Biometría y función orgánica, patología con inmunohistoquímica o pruebas moleculares seleccionadas y laboratorios guiados por la presentación; evitar paneles indiscriminados de marcadores.",
    estudiosImagen: "TC, RM, PET/TC u otra imagen según distribución y pregunta clínica; comparar estudios previos y elegir el sitio de biopsia con mejor rendimiento y menor riesgo.",
    diagnosticoDiferencial: "Segundo tumor primario, lesión benigna o inflamatoria, neoplasia hematológica y clasificación errónea del sitio de origen.",
    complicaciones: "Falla orgánica, dolor, fractura o compresión, derrames, trombosis, deterioro funcional y progresión multisistémica."
  },
  C81_C96: {
    ...C_BASE,
    definicionClinica: "Neoplasia maligna de tejido linfoide, hematopoyético o afín. La CIE-10 aporta una categoría diagnóstica, pero la clasificación contemporánea requiere morfología, inmunofenotipo, genética y contexto clínico.",
    manifestacionesClinicas: "Adenopatías, fiebre, sudoración nocturna, pérdida de peso, fatiga, infecciones, sangrado, citopenias, esplenomegalia, dolor óseo o infiltración de órganos; también puede descubrirse en laboratorio.",
    criteriosDiagnosticos: "Biometría, frotis y evaluación clínica orientan; la confirmación puede requerir biopsia ganglionar o tisular, aspirado/biopsia de médula, citometría, citogenética y pruebas moleculares. Aplicar criterios de la entidad concreta.",
    laboratoriosRecomendados: "Biometría con diferencial y frotis, función renal y hepática, electrólitos, LDH y estudios de lisis tumoral o infección según riesgo; inmunofenotipo, citogenética y molecular cuando correspondan.",
    estudiosImagen: "TC o PET/TC en linfomas seleccionados; RM u otros estudios por síntomas. La imagen no sustituye la caracterización hematopatológica.",
    diagnosticoDiferencial: "Infección, reacción medicamentosa, enfermedad autoinmune, citopenia reactiva, trastorno benigno de médula o ganglio y metástasis sólida.",
    tratamientoEspecifico: "Puede incluir observación en entidades indolentes seleccionadas, quimioterapia, anticuerpos, terapias dirigidas, inmunoterapia, radiación o trasplante. Requiere hematología/oncología y clasificación precisa.",
    complicaciones: "Infección o hemorragia por citopenias, lisis tumoral, hiperviscosidad, infiltración orgánica, transformación, recaída y toxicidad terapéutica."
  },
  C97: {
    ...C_BASE,
    definicionClinica: "Presencia de tumores malignos primarios múltiples e independientes. No debe utilizarse para una sola neoplasia con metástasis en varios órganos.",
    criteriosDiagnosticos: "Documentar que cada tumor representa un primario independiente mediante sitio, histología, cronología y, cuando ayude, perfil molecular; excluir recurrencia o metástasis.",
    diagnosticoDiferencial: "Metástasis múltiples de un solo primario, recurrencia, extensión contigua y clasificación duplicada del mismo tumor.",
    tratamientoEspecifico: "Priorizar cada primario según amenaza clínica, posibilidad curativa, interacciones entre tratamientos, función orgánica y preferencias del paciente mediante coordinación multidisciplinaria.",
    pronostico: "Depende de la biología y el estadio de cada primario y de la posibilidad de integrar sus tratamientos; el código C97 no permite una estimación aislada."
  },
  D00_D09: {
    definicionClinica: "Neoplasia epitelial in situ: células neoplásicas confinadas al epitelio o estructura de origen, sin invasión demostrada del estroma. El sitio anatómico exacto determina la subcategoría.",
    etiologia: "Multifactorial y dependiente del sitio; puede relacionarse con edad, susceptibilidad, exposiciones, inflamación crónica o agentes oncogénicos. El código no demuestra una causa concreta.",
    agenteCausal: "No hay un agente causal único. Registrar por separado una infección o exposición demostrada cuando sea relevante.",
    epidemiologia: "La detección depende del sitio y de la disponibilidad de programas de tamizaje o biopsia; la frecuencia no puede inferirse del código.",
    manifestacionesClinicas: "Con frecuencia es asintomática o se identifica por tamizaje; también puede producir lesión visible, sangrado, secreción u otros síntomas locales.",
    criteriosDiagnosticos: "La anatomía patológica debe demostrar el patrón in situ y ausencia de invasión en una muestra adecuada; si la muestra no permite excluir invasión, se requiere evaluación adicional.",
    laboratoriosRecomendados: "No existe laboratorio universal. Solicitar pruebas dirigidas al sitio y evaluación basal según procedimiento o tratamiento.",
    estudiosImagen: "Imagen o endoscopia según el órgano para localizar y estimar extensión; la imagen no sustituye la demostración histológica de ausencia de invasión.",
    diagnosticoDiferencial: "Displasia, lesión benigna o reactiva, infección, neoplasia invasora y tumor de comportamiento incierto.",
    complicaciones: "Persistencia, recurrencia o progresión a neoplasia invasora; morbilidad local o derivada del tratamiento.",
    tratamientoInicial: "Confirmar patología y extensión, descartar invasión y derivar al especialista del órgano.",
    tratamientoEspecifico: "Escisión, ablación, resección u otra terapia local según sitio, extensión y riesgo; algunos escenarios requieren vigilancia protocolizada. El código no define la técnica.",
    prevencion: "Control de factores modificables, vacunación o tamizaje cuando exista recomendación válida para el sitio y riesgo.",
    pronostico: "Suele ser favorable con manejo adecuado, pero depende del sitio, extensión, márgenes, recurrencia y riesgo de invasión.",
    exclusiones: "No mezclar con tumor invasor C00–C97, benigno D10–D36 o de comportamiento incierto D37–D48; revisar la lista tabular.",
    fuentesClinicas: [CLINICAL_SOURCES.cancerDiagnosis, CLINICAL_SOURCES.cancerTreatment]
  },
  D10_D36: {
    definicionClinica: "Neoplasia clasificada como benigna por su comportamiento. Aunque no invade ni metastatiza como un tumor maligno, puede causar síntomas por tamaño, localización, secreción hormonal o recurrencia.",
    etiologia: "Variable; incluye alteraciones esporádicas o hereditarias, estímulos hormonales y otros mecanismos propios del tejido. El código no identifica una causa individual.",
    agenteCausal: "No existe un agente causal único inferible del código.",
    epidemiologia: "Varía por tipo y órgano; muchas lesiones se detectan de forma incidental.",
    manifestacionesClinicas: "Puede ser asintomática o causar masa, dolor, obstrucción, sangrado, déficit neurológico o exceso hormonal según la localización.",
    criteriosDiagnosticos: "Integrar clínica e imagen; confirmar histología cuando sea necesario para distinguir comportamiento benigno, incierto o maligno. Algunas lesiones típicas pueden vigilarse con criterios especializados.",
    laboratoriosRecomendados: "Pruebas basales y estudios hormonales o funcionales dirigidos por órgano; no existe marcador universal.",
    estudiosImagen: "Ultrasonido, radiografía, TC o RM según sitio para caracterizar tamaño, relación anatómica y crecimiento; evitar seguimiento sin un objetivo definido.",
    diagnosticoDiferencial: "Quiste, lesión inflamatoria o infecciosa, malformación, neoplasia in situ, incierta o maligna.",
    complicaciones: "Compresión, obstrucción, sangrado, alteración hormonal o funcional, recurrencia y complicaciones del procedimiento.",
    tratamientoInicial: "Confirmar que no existan datos de urgencia, invasión o compromiso funcional y derivar según órgano.",
    tratamientoEspecifico: "Observación, resección, ablación o control funcional según síntomas, crecimiento, sitio y certeza diagnóstica.",
    prevencion: "No hay prevención universal; vigilancia genética o de órgano solo en síndromes y riesgos definidos.",
    pronostico: "Generalmente favorable, modulado por localización, posibilidad de resección, recurrencia y función del órgano.",
    exclusiones: "Distinguir de neoplasia in situ, de comportamiento incierto o maligna y revisar inclusiones/exclusiones OMS.",
    fuentesClinicas: [CLINICAL_SOURCES.cancerDiagnosis]
  },
  D37_D48: {
    definicionClinica: "Neoplasia cuyo comportamiento biológico es incierto o no puede establecerse con la información disponible. No equivale automáticamente a cáncer ni a lesión benigna.",
    etiologia: "Depende del tejido y de la entidad; el código describe incertidumbre de comportamiento, no una etiología.",
    agenteCausal: "No existe un agente causal único inferible del código.",
    epidemiologia: "Heterogénea y dependiente de las definiciones patológicas; el código no permite estimar frecuencia.",
    manifestacionesClinicas: "Hallazgo incidental, masa, citopenia, adenopatía, dolor, sangrado, obstrucción o alteración funcional según el sitio.",
    criteriosDiagnosticos: "Revisar adecuación de la muestra y correlación clínico-radiológica. Patología, inmunohistoquímica, citometría, citogenética o molecular pueden ser necesarias para establecer la entidad y su comportamiento.",
    laboratoriosRecomendados: "Pruebas dirigidas por órgano; en tejido hematopoyético, biometría, frotis, médula, citometría y estudios genéticos según sospecha.",
    estudiosImagen: "Caracterización y seguimiento por modalidad apropiada al sitio; comparar crecimiento y elegir biopsia cuando cambie manejo.",
    diagnosticoDiferencial: "Neoplasia benigna, in situ o maligna, lesión reactiva o inflamatoria y muestra insuficiente.",
    complicaciones: "Progresión, transformación, recurrencia, compresión o falla orgánica y demora diagnóstica.",
    tratamientoInicial: "Confirmar el informe patológico, resolver urgencias y obtener valoración especializada.",
    tratamientoEspecifico: "Vigilancia, nueva muestra, resección o terapia específica según entidad y riesgo; no tratar como malignidad solo por el código.",
    prevencion: "No existe prevención universal; controlar factores del sitio y usar vigilancia individualizada.",
    pronostico: "Variable y no deducible del código; depende de la entidad definitiva, evolución y marcadores de riesgo.",
    exclusiones: "Usar únicamente cuando la lista tabular y la documentación sostengan comportamiento incierto o desconocido; no sustituir un diagnóstico histológico disponible.",
    fuentesClinicas: [CLINICAL_SOURCES.cancerDiagnosis]
  },
  D50_D53: {
    definicionClinica: "Anemia nutricional por disponibilidad insuficiente o utilización alterada de hierro, vitamina B12, folato u otros nutrientes especificados.",
    etiologia: "Ingesta insuficiente, pérdidas, malabsorción, demanda aumentada, fármacos o trastornos metabólicos, según la subcategoría.",
    agenteCausal: "No es una infección; el factor causal es la deficiencia o alteración nutricional indicada, cuya causa subyacente debe investigarse.",
    epidemiologia: "La frecuencia depende de edad, dieta, embarazo, pérdidas sanguíneas, enfermedades gastrointestinales y condiciones sociales o clínicas.",
    manifestacionesClinicas: "Fatiga, palidez, disnea de esfuerzo, taquicardia, debilidad; puede haber glositis, pica, neuropatía o hallazgos específicos de la deficiencia.",
    criteriosDiagnosticos: "Confirmar anemia con biometría y caracterizar índices eritrocitarios; demostrar la deficiencia y buscar su causa. No asignar una etiología solo por microcitosis o macrocitosis.",
    laboratoriosRecomendados: "Biometría con índices, reticulocitos y frotis; ferritina y saturación de transferrina, vitamina B12, folato y estudios de pérdida o malabsorción según sospecha.",
    estudiosImagen: "No es rutinaria para confirmar anemia; endoscopia o imagen se seleccionan para investigar sangrado, malabsorción o enfermedad subyacente.",
    diagnosticoDiferencial: "Anemia de inflamación, hemoglobinopatía, hemólisis, enfermedad renal, hipotiroidismo, trastorno medular y sangrado agudo.",
    complicaciones: "Deterioro funcional, isquemia en personas vulnerables, alteraciones neurocognitivas por B12 y complicaciones de la causa subyacente.",
    tratamientoInicial: "Valorar gravedad e inestabilidad, corregir la deficiencia y buscar pérdidas o malabsorción; transfundir solo por indicación clínica, no por el código aislado.",
    tratamientoEspecifico: "Reposición oral o parenteral del nutriente según causa y tolerancia, junto con tratamiento de la fuente de pérdida o malabsorción.",
    prevencion: "Alimentación adecuada, suplementación en grupos indicados y detección y control de pérdidas o malabsorción.",
    pronostico: "Generalmente favorable si se corrigen deficiencia y causa; puede recurrir si persiste la etiología.",
    exclusiones: "Confirmar la deficiencia específica y revisar códigos de anemia por enfermedad crónica, hemólisis, aplasia u otras causas.",
    fuentesClinicas: [CLINICAL_SOURCES.anemiaDiagnosis, CLINICAL_SOURCES.anemiaTreatment]
  },
  D55_D59: {
    definicionClinica: "Anemia hemolítica por destrucción acelerada de eritrocitos, hereditaria o adquirida, según la categoría.",
    etiologia: "Defectos enzimáticos, membrana o hemoglobina; anticuerpos, fármacos, infecciones, tóxicos, mecanismos mecánicos u otras causas adquiridas.",
    agenteCausal: "No hay un agente único; documentar el defecto hereditario, anticuerpo, fármaco, infección o exposición demostrados.",
    epidemiologia: "Varía por genética, origen poblacional, edad, exposiciones y enfermedades asociadas.",
    manifestacionesClinicas: "Anemia, ictericia, orina oscura, fatiga, esplenomegalia, dolor o crisis; una hemólisis aguda puede causar inestabilidad y lesión renal.",
    criteriosDiagnosticos: "Demostrar anemia y evidencia de hemólisis, después definir el mecanismo con historia, frotis, prueba de antiglobulina y estudios enzimáticos o de hemoglobina según el caso.",
    laboratoriosRecomendados: "Biometría, reticulocitos, bilirrubina indirecta, LDH, haptoglobina, EGO y frotis; Coombs directo, G6PD, electroforesis o genética cuando estén indicados.",
    estudiosImagen: "No confirma hemólisis; ultrasonido u otra imagen puede evaluar bazo, litiasis o complicaciones.",
    diagnosticoDiferencial: "Sangrado, producción medular insuficiente, hepatopatía, síndrome microangiopático y otras causas de ictericia.",
    complicaciones: "Crisis anémica, lesión renal, trombosis, cálculos pigmentarios, sobrecarga de hierro y complicaciones transfusionales.",
    tratamientoInicial: "Evaluar gravedad, suspender desencadenantes sospechosos con supervisión, tratar infección o crisis y apoyar oxigenación o transfusión cuando esté indicada.",
    tratamientoEspecifico: "Depende del mecanismo: evitar oxidantes, tratar causa, inmunoterapia, transfusión compatible, quelación, esplenectomía o terapia dirigida en escenarios seleccionados.",
    prevencion: "Consejería genética cuando proceda, evitar desencadenantes conocidos y prevenir o tratar infecciones conforme a la entidad.",
    pronostico: "Variable; depende del mecanismo, intensidad, daño orgánico y respuesta al tratamiento.",
    exclusiones: "No confundir con anemia por deficiencia, sangrado o producción insuficiente; identificar fármaco o enfermedad subyacente con código adicional cuando corresponda.",
    fuentesClinicas: [CLINICAL_SOURCES.anemiaDiagnosis, CLINICAL_SOURCES.anemiaTreatment]
  },
  D60_D64: {
    definicionClinica: "Grupo de anemias por producción eritroide insuficiente, aplasia o causas crónicas y no especificadas. La subcategoría determina el mecanismo.",
    etiologia: "Puede ser autoinmune, clonal, congénita, farmacológica, tóxica, infecciosa o secundaria a enfermedad crónica, renal, neoplásica o medular.",
    agenteCausal: "No existe un agente único; identificar enfermedad, fármaco, tóxico o defecto causal cuando se demuestre.",
    epidemiologia: "Heterogénea; depende de edad, exposiciones, comorbilidades y trastornos hereditarios o adquiridos.",
    manifestacionesClinicas: "Fatiga, palidez, disnea y taquicardia; si coexisten otras citopenias puede haber infección, fiebre, equimosis o sangrado.",
    criteriosDiagnosticos: "Confirmar anemia y respuesta reticulocitaria baja o inapropiada, excluir deficiencia, hemólisis y sangrado, y estudiar médula cuando las citopenias o el contexto lo indiquen.",
    laboratoriosRecomendados: "Biometría con diferencial, reticulocitos, frotis, hierro, B12, folato, función renal y hepática; aspirado/biopsia, citometría, citogenética, virología o autoinmunidad dirigidos.",
    estudiosImagen: "No suele confirmar la anemia; se usa para enfermedad subyacente, bazo, masa o complicación según clínica.",
    diagnosticoDiferencial: "Anemia nutricional, hemólisis, sangrado, enfermedad renal o inflamatoria y neoplasia hematológica.",
    complicaciones: "Hipoxia, infección y hemorragia si hay pancitopenia, sobrecarga de hierro y progresión clonal en entidades específicas.",
    tratamientoInicial: "Valorar gravedad, infección o sangrado, retirar posibles tóxicos con supervisión y brindar soporte transfusional o antimicrobiano cuando esté indicado.",
    tratamientoEspecifico: "Tratar la causa; puede requerir inmunosupresión, factores de crecimiento, terapia dirigida o trasplante bajo hematología. No existe un esquema común para todo el grupo.",
    prevencion: "Evitar exposiciones mielotóxicas innecesarias, monitorizar fármacos de riesgo y tratar enfermedades causales.",
    pronostico: "Depende de la causa, profundidad de citopenias, infecciones, clonabilidad y respuesta.",
    exclusiones: "Distinguir de anemia nutricional, hemolítica, por sangrado y neoplasia; los códigos con asterisco requieren codificar también la enfermedad subyacente.",
    fuentesClinicas: [CLINICAL_SOURCES.anemiaDiagnosis, CLINICAL_SOURCES.anemiaTreatment]
  },
  D65_D69: {
    definicionClinica: "Defecto de coagulación, plaquetas o vasos que produce sangrado, trombosis o ambos según la entidad.",
    etiologia: "Hereditario o adquirido por deficiencia o inhibición de factores, alteración plaquetaria, consumo, autoinmunidad, enfermedad hepática, fármacos u otros procesos.",
    agenteCausal: "No hay un agente único. Documentar defecto, anticuerpo, enfermedad o fármaco causal.",
    epidemiologia: "Varía ampliamente entre trastornos hereditarios raros y alteraciones adquiridas frecuentes.",
    manifestacionesClinicas: "Equimosis, petequias, sangrado mucoso o profundo, hemorragia posprocedimiento o trombosis; algunos casos se detectan por laboratorio.",
    criteriosDiagnosticos: "Integrar patrón de sangrado o trombosis, historia familiar y farmacológica con biometría y pruebas de hemostasia; confirmar el defecto mediante ensayos específicos.",
    laboratoriosRecomendados: "Biometría y plaquetas, TP/INR, TTPa, fibrinógeno, dímero D y pruebas de mezcla; factores, von Willebrand, función plaquetaria, anticuerpos o genética según sospecha.",
    estudiosImagen: "Dirigida a localizar hemorragia o trombosis y valorar daño orgánico; no sustituye pruebas de hemostasia.",
    diagnosticoDiferencial: "Trauma, hepatopatía, anticoagulación, sepsis, microangiopatía, trastorno plaquetario, vasculitis y sangrado anatómico local.",
    complicaciones: "Hemorragia mayor o intracraneal, anemia, síndrome compartimental, artropatía, trombosis, falla orgánica y complicaciones transfusionales.",
    tratamientoInicial: "Estabilizar, controlar el sitio de sangrado o trombosis, revisar fármacos y obtener pruebas antes de corregir cuando sea seguro.",
    tratamientoEspecifico: "Puede requerir reemplazo de factor, desmopresina, antifibrinolítico, vitamina K, antídoto, inmunosupresión, transfusión o anticoagulación en trombofilia; depende estrictamente de la entidad.",
    prevencion: "Evitar fármacos y procedimientos de riesgo sin plan, profilaxis específica y consejería genética o perioperatoria cuando corresponda.",
    pronostico: "Depende del defecto, gravedad, acceso a tratamiento y daño por sangrado o trombosis.",
    exclusiones: "No asumir riesgo hemorrágico en las subcategorías de trombofilia; confirmar el mecanismo y revisar exclusiones OMS.",
    fuentesClinicas: [CLINICAL_SOURCES.bleedingDiagnosis, CLINICAL_SOURCES.bleedingTreatment]
  },
  D70_D77: {
    definicionClinica: "Trastornos de leucocitos, bazo, metahemoglobina y otras alteraciones de sangre u órganos hematopoyéticos. La categoría específica define el componente afectado.",
    etiologia: "Congénita o adquirida por infección, autoinmunidad, fármacos, tóxicos, enfermedad sistémica, proliferación clonal o alteración funcional.",
    agenteCausal: "No existe un agente único; identificar fármaco, infección, exposición o enfermedad causal cuando proceda.",
    epidemiologia: "Heterogénea y dependiente de la entidad; varios trastornos son raros.",
    manifestacionesClinicas: "Infecciones recurrentes o fiebre, citopenias o leucocitosis, esplenomegalia, hipoxia o cianosis, trombosis, sangrado o hallazgo incidental.",
    criteriosDiagnosticos: "Confirmar la alteración en muestras repetidas cuando sea apropiado y correlacionar con clínica, fármacos y antecedentes; usar frotis, médula, citometría, pruebas funcionales o genéticas según entidad.",
    laboratoriosRecomendados: "Biometría con diferencial y frotis, reticulocitos y función orgánica; cultivos si hay fiebre, metahemoglobina, médula, citometría, citogenética o pruebas funcionales dirigidas.",
    estudiosImagen: "Ultrasonido o TC para bazo o adenopatías y estudios dirigidos por complicaciones; no son rutinarios para toda alteración hematológica.",
    diagnosticoDiferencial: "Respuesta reactiva a infección o fármacos, neoplasia hematológica, autoinmunidad, trastorno medular y error preanalítico.",
    complicaciones: "Sepsis en neutropenia, hipoxia, trombosis o sangrado, hiperesplenismo, falla orgánica y transformación clonal en entidades específicas.",
    tratamientoInicial: "La fiebre con neutropenia o la hipoxia grave requieren evaluación urgente; suspender desencadenantes solo con plan clínico y brindar soporte según el defecto.",
    tratamientoEspecifico: "Tratar causa y complicaciones; puede incluir antimicrobianos, factores de crecimiento, flebotomía, antídotos, inmunoterapia, esplenectomía o terapia hematológica especializada.",
    prevencion: "Monitorizar fármacos mielotóxicos, vacunación y prevención de infección según condición, y consejería genética cuando aplique.",
    pronostico: "Variable por etiología, gravedad, infección, trombosis y respuesta.",
    exclusiones: "Distinguir alteraciones reactivas, neoplasias y manifestaciones de enfermedades clasificadas en otra parte; D77 es un código con asterisco.",
    fuentesClinicas: [CLINICAL_SOURCES.anemiaDiagnosis]
  },
  D80_D89: {
    definicionClinica: "Trastorno que afecta componentes humorales, celulares, combinados o reguladores del sistema inmunitario, incluida sarcoidosis y otras entidades del grupo.",
    etiologia: "Puede ser genética, adquirida, inflamatoria o de regulación inmune. Deben excluirse causas secundarias como fármacos, infección, neoplasia, pérdida de proteínas o malnutrición según el cuadro.",
    agenteCausal: "No hay un agente causal único; las infecciones pueden ser consecuencia y no causa primaria. Documentar defecto genético o causa secundaria si se confirma.",
    epidemiologia: "Muchos errores innatos de la inmunidad son raros; la edad de presentación y prevalencia varían por entidad y población.",
    manifestacionesClinicas: "Infecciones recurrentes, graves o inusuales, mala respuesta terapéutica, autoinmunidad, inflamación, granulomas, alergia, linfoproliferación o falla de crecimiento.",
    criteriosDiagnosticos: "El patrón clínico orienta, pero la confirmación requiere cuantificar y probar componentes inmunes y excluir inmunodeficiencia secundaria. Aplicar criterios especializados de la entidad.",
    laboratoriosRecomendados: "Biometría con diferencial, inmunoglobulinas, subpoblaciones linfocitarias, complemento y respuesta a vacunas o ensayos funcionales; genética, electroforesis, VIH y otros estudios dirigidos.",
    estudiosImagen: "Dirigida a infecciones, daño pulmonar, adenopatías, granulomas o complicaciones; no existe estudio universal.",
    diagnosticoDiferencial: "Inmunosupresión farmacológica, VIH u otra infección, neoplasia, pérdida de proteínas, malnutrición y trastorno autoinmune sistémico.",
    complicaciones: "Infección grave o crónica, bronquiectasias y daño orgánico, autoinmunidad, granulomatosis y mayor riesgo de ciertos tumores.",
    tratamientoInicial: "Tratar con rapidez infecciones y complicaciones, evitar vacunas vivas hasta aclarar seguridad en inmunodeficiencia relevante y derivar a inmunología/hematología.",
    tratamientoEspecifico: "Puede incluir profilaxis antimicrobiana, reemplazo de inmunoglobulina, inmunomodulación, terapia dirigida o trasplante según el defecto; individualizar vacunación.",
    prevencion: "Higiene y vacunación individualizada, profilaxis cuando esté indicada, evitar exposiciones y consejería genética en trastornos hereditarios.",
    pronostico: "Oscila de formas leves a enfermedades potencialmente mortales y depende de diagnóstico temprano, infecciones, daño orgánico y acceso a terapia.",
    exclusiones: "Excluir causas secundarias y respetar las exclusiones del capítulo, entre ellas VIH, autoinmunidad sistémica y neoplasias cuando correspondan.",
    fuentesClinicas: [CLINICAL_SOURCES.immuneDisorders, CLINICAL_SOURCES.niaidPidd]
  }
};

const RULES = {
  breastHormonal: {
    id: "anticonceptivo_hormonal_cancer_mama_activo",
    categoriaRiesgo: "cancer_mama_activo",
    tipo: "contraindicacion",
    severidad: "critica",
    titulo: "Anticoncepción hormonal en cáncer de mama actual",
    medicamento: { ingredientes: ["anticonceptivo_hormonal"], clases: [], riesgos: [], excluirIngredientes: [], excluirClases: [] },
    mecanismo: "El cáncer de mama puede ser hormonodependiente y los criterios CDC MEC clasifican los métodos hormonales como categoría 4 en enfermedad actual.",
    efecto: "Riesgo clínico inaceptable para iniciar o continuar un método hormonal sin reevaluación especializada.",
    recomendacion: "No iniciar ni renovar automáticamente. Confirmar que el diagnóstico esté activo, identificar el método exacto y coordinar una alternativa no hormonal con oncología y salud reproductiva.",
    parametrosVigilancia: ["Estado oncológico actual", "Método y componentes hormonales", "Plan anticonceptivo alternativo"],
    permiteOverride: false,
    requiereJustificacion: true,
    evidencia: "guia_oficial_cdc_mec_2024",
    confianza: "alta",
    fuentes: ["https://www.cdc.gov/mmwr/volumes/73/rr/rr7304a1_appendix.htm"]
  },
  breastInSituHormonal: {
    id: "anticonceptivo_hormonal_carcinoma_mama_in_situ",
    categoriaRiesgo: "neoplasia_mama_in_situ",
    tipo: "precaucion_vigilancia",
    severidad: "alta",
    titulo: "Método hormonal con carcinoma in situ de mama",
    medicamento: { ingredientes: ["anticonceptivo_hormonal"], clases: [], riesgos: [], excluirIngredientes: [], excluirClases: [] },
    mecanismo: "El código no informa estado, receptores ni plan oncológico; una lesión mamaria in situ requiere verificar elegibilidad específica antes de exposición hormonal.",
    efecto: "Puede existir una contraindicación oncológica dependiente de la entidad y del estado actual.",
    recomendacion: "No asumir seguridad por tratarse de una lesión in situ. Confirmar patología, actividad y método con oncología y salud reproductiva; preferir alternativa no hormonal mientras se aclara.",
    parametrosVigilancia: ["Patología y receptores", "Estado actual", "Método hormonal"],
    permiteOverride: true,
    requiereJustificacion: true,
    evidencia: "extrapolacion_cautelosa_guia_cdc",
    confianza: "moderada",
    fuentes: ["https://www.cdc.gov/mmwr/volumes/73/rr/rr7304a1_appendix.htm"]
  },
  cnsBupropion: {
    id: "bupropion_tumor_snc",
    categoriaRiesgo: "tumor_snc",
    tipo: "contraindicacion",
    severidad: "critica",
    titulo: "Bupropión en tumor del sistema nervioso central",
    medicamento: { ingredientes: ["bupropion"], clases: [], riesgos: [], excluirIngredientes: [], excluirClases: [] },
    mecanismo: "Los tumores del SNC aumentan el riesgo convulsivo; el etiquetado de bupropión XL los incluye entre las condiciones que incrementan ese riesgo.",
    efecto: "Aumento clínicamente relevante del riesgo de convulsión.",
    recomendacion: "No prescribir automáticamente. Verificar localización, actividad, antecedentes convulsivos y formulación; seleccionar alternativa o documentar decisión especializada conforme al etiquetado aplicable.",
    parametrosVigilancia: ["Actividad y localización tumoral", "Antecedente convulsivo", "Dosis y formulación de bupropión", "Otros fármacos que reducen el umbral"],
    permiteOverride: false,
    requiereJustificacion: true,
    evidencia: "etiquetado_oficial_fda",
    confianza: "alta",
    fuentes: ["https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/021515s046lbl.pdf"]
  },
  g6pdTmpSmx: {
    id: "tmp_smx_deficiencia_g6pd",
    categoriaRiesgo: "deficiencia_g6pd",
    tipo: "precaucion_vigilancia",
    severidad: "alta",
    titulo: "Trimetoprim/sulfametoxazol en deficiencia de G6PD",
    medicamento: { ingredientes: ["trimetoprim"], clases: [], riesgos: [], excluirIngredientes: [], excluirClases: [] },
    mecanismo: "El etiquetado informa que puede ocurrir hemólisis en personas con deficiencia de G6PD y que la reacción suele relacionarse con la dosis.",
    efecto: "Riesgo de hemólisis aguda y anemia.",
    recomendacion: "Valorar alternativa y necesidad. Si se utiliza, documentar gravedad de la deficiencia y vigilar síntomas, hemoglobina, reticulocitos, bilirrubina, LDH y función renal según el contexto.",
    parametrosVigilancia: ["Hemoglobina", "Reticulocitos", "Bilirrubina y LDH", "Orina oscura", "Función renal"],
    permiteOverride: true,
    requiereJustificacion: true,
    evidencia: "etiquetado_oficial_dailymed",
    confianza: "alta",
    fuentes: ["https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3233c54d-484d-4550-b172-db8af47d1b7f"]
  },
  marrowMyelosuppression: {
    id: "mielosupresor_insuficiencia_medular",
    categoriaRiesgo: "insuficiencia_medular",
    tipo: "precaucion_vigilancia",
    severidad: "alta",
    titulo: "Fármaco mielosupresor en insuficiencia medular",
    medicamento: { ingredientes: ["clozapina"], clases: ["mielosupresor", "antimetabolito", "inmunosupresor"], riesgos: ["mielosupresion"], excluirIngredientes: [], excluirClases: [] },
    mecanismo: "La toxicidad medular farmacológica puede agravar citopenias preexistentes.",
    efecto: "Mayor riesgo de anemia, neutropenia, trombocitopenia, infección o sangrado.",
    recomendacion: "Confirmar indicación con hematología, revisar biometría y recuentos absolutos basales y acordar umbrales y frecuencia de vigilancia antes de iniciar o continuar.",
    parametrosVigilancia: ["Biometría hemática", "Neutrófilos absolutos", "Plaquetas", "Fiebre o infección", "Sangrado"],
    permiteOverride: true,
    requiereJustificacion: true,
    evidencia: "etiquetado_y_principio_farmacologico",
    confianza: "alta",
    fuentes: ["https://www.fda.gov/drugs/risk-evaluation-and-mitigation-strategies-rems/information-clozapine"]
  },
  bleedingRisk: {
    id: "farmaco_riesgo_hemorragico_trastorno_hemostasia",
    categoriaRiesgo: "hemostasia_alterada",
    tipo: "precaucion_vigilancia",
    severidad: "alta",
    titulo: "Fármaco con riesgo hemorrágico en trastorno de hemostasia",
    medicamento: { ingredientes: ["valproato"], clases: ["anticoagulante", "antiagregante", "aine"], riesgos: ["sangrado"], excluirIngredientes: [], excluirClases: [] },
    mecanismo: "La anticoagulación, inhibición plaquetaria, lesión gastrointestinal o trombocitopenia farmacológica puede sumarse al defecto hemostático.",
    efecto: "Mayor riesgo de hemorragia clínica o caída adicional de plaquetas.",
    recomendacion: "Confirmar mecanismo e indicación, evitar duplicidad, obtener biometría y pruebas de coagulación pertinentes y definir vigilancia o alternativa. No suspender anticoagulación indicada sin valorar riesgo trombótico.",
    parametrosVigilancia: ["Sangrado", "Hemoglobina y plaquetas", "TP/INR y TTPa según fármaco", "Función renal y hepática"],
    permiteOverride: true,
    requiereJustificacion: true,
    evidencia: "guias_y_etiquetado_oficial",
    confianza: "alta",
    fuentes: ["https://www.nhlbi.nih.gov/health/bleeding-disorders/treatment", "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=cef3e335-5891-412f-89c4-79fcd2f145b7&type=display"]
  },
  thrombophiliaHormonal: {
    id: "anticonceptivo_hormonal_trombofilia",
    categoriaRiesgo: "trombofilia",
    tipo: "precaucion_vigilancia",
    severidad: "alta",
    titulo: "Anticoncepción hormonal en trombofilia",
    medicamento: { ingredientes: ["anticonceptivo_hormonal"], clases: [], riesgos: [], excluirIngredientes: [], excluirClases: [] },
    mecanismo: "Los métodos con estrógeno pueden aumentar riesgo trombótico; la elegibilidad de métodos solo con progestágeno depende del método y del contexto.",
    efecto: "Riesgo de tromboembolia potencialmente mayor y método-dependiente.",
    recomendacion: "Identificar la formulación. No iniciar un método combinado con estrógeno sin revisar criterios MEC; seleccionar alternativa con salud reproductiva y hematología cuando proceda.",
    parametrosVigilancia: ["Tipo de trombofilia", "Antecedente de trombosis", "Componente estrogénico", "Otros factores trombóticos"],
    permiteOverride: true,
    requiereJustificacion: true,
    evidencia: "guia_oficial_cdc_mec_2024",
    confianza: "alta",
    fuentes: ["https://www.cdc.gov/contraception/hcp/usspr/classifications-mec-contraception.html"]
  },
  clozapineNeutropenia: {
    id: "clozapina_neutropenia_agranulocitosis",
    categoriaRiesgo: "neutropenia",
    tipo: "precaucion_vigilancia",
    severidad: "alta",
    titulo: "Clozapina en neutropenia o agranulocitosis",
    medicamento: { ingredientes: ["clozapina"], clases: [], riesgos: [], excluirIngredientes: [], excluirClases: [] },
    mecanismo: "Clozapina puede causar neutropenia grave e infección potencialmente mortal.",
    efecto: "Puede agravar un recuento bajo de neutrófilos y aumentar el riesgo infeccioso.",
    recomendacion: "Verificar diagnóstico activo, causa y ANC. Coordinar la decisión y el calendario de ANC con psiquiatría y hematología conforme al etiquetado actual; la eliminación del REMS no elimina la vigilancia clínica.",
    parametrosVigilancia: ["ANC", "Fiebre", "Datos de infección", "Tendencia de leucocitos"],
    permiteOverride: true,
    requiereJustificacion: true,
    evidencia: "etiquetado_y_comunicacion_fda_2025",
    confianza: "alta",
    fuentes: ["https://www.fda.gov/drugs/drug-safety-and-availability/fda-removes-risk-evaluation-and-mitigation-strategy-rems-program-antipsychotic-drug-clozapine", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/019758s107lbl.pdf"]
  }
};

const GROUPS = [
  ["C00", "C14", "II", "Tumores [neoplasias]", "C00-C14", "Tumores malignos del labio, de la cavidad bucal y de la faringe", "C00_C14"],
  ["C15", "C26", "II", "Tumores [neoplasias]", "C15-C26", "Tumores malignos de los órganos digestivos", "C15_C26"],
  ["C30", "C39", "II", "Tumores [neoplasias]", "C30-C39", "Tumores malignos de los órganos respiratorios e intratorácicos", "C30_C39"],
  ["C40", "C41", "II", "Tumores [neoplasias]", "C40-C41", "Tumores malignos de los huesos y de los cartílagos articulares", "C40_C41"],
  ["C43", "C44", "II", "Tumores [neoplasias]", "C43-C44", "Melanoma y otros tumores malignos de la piel", "C43"],
  ["C45", "C49", "II", "Tumores [neoplasias]", "C45-C49", "Tumores malignos de los tejidos mesoteliales y de los tejidos blandos", "C45_C49"],
  ["C50", "C50", "II", "Tumores [neoplasias]", "C50", "Tumor maligno de la mama", "C50"],
  ["C51", "C58", "II", "Tumores [neoplasias]", "C51-C58", "Tumores malignos de los órganos genitales femeninos", "C51_C58"],
  ["C60", "C63", "II", "Tumores [neoplasias]", "C60-C63", "Tumores malignos de los órganos genitales masculinos", "C60_C63"],
  ["C64", "C68", "II", "Tumores [neoplasias]", "C64-C68", "Tumores malignos de las vías urinarias", "C64_C68"],
  ["C69", "C72", "II", "Tumores [neoplasias]", "C69-C72", "Tumores malignos del ojo, del encéfalo y de otras partes del sistema nervioso central", "C69_C72"],
  ["C73", "C75", "II", "Tumores [neoplasias]", "C73-C75", "Tumores malignos de la glándula tiroides y de otras glándulas endocrinas", "C73_C75"],
  ["C76", "C80", "II", "Tumores [neoplasias]", "C76-C80", "Tumores malignos de sitios mal definidos, secundarios y de sitios no especificados", "C76_C80"],
  ["C81", "C96", "II", "Tumores [neoplasias]", "C81-C96", "Tumores malignos del tejido linfático, de los órganos hematopoyéticos y de tejidos afines", "C81_C96"],
  ["C97", "C97", "II", "Tumores [neoplasias]", "C97", "Tumores malignos de sitios múltiples independientes", "C97"],
  ["D00", "D09", "II", "Tumores [neoplasias]", "D00-D09", "Tumores [neoplasias] in situ", "D00_D09"],
  ["D10", "D36", "II", "Tumores [neoplasias]", "D10-D36", "Tumores [neoplasias] benignos", "D10_D36"],
  ["D37", "D48", "II", "Tumores [neoplasias]", "D37-D48", "Tumores [neoplasias] de comportamiento incierto o desconocido", "D37_D48"],
  ["D50", "D53", "III", "Enfermedades de la sangre y de los órganos hematopoyéticos, y ciertos trastornos que afectan el mecanismo de la inmunidad", "D50-D53", "Anemias nutricionales", "D50_D53"],
  ["D55", "D59", "III", "Enfermedades de la sangre y de los órganos hematopoyéticos, y ciertos trastornos que afectan el mecanismo de la inmunidad", "D55-D59", "Anemias hemolíticas", "D55_D59"],
  ["D60", "D64", "III", "Enfermedades de la sangre y de los órganos hematopoyéticos, y ciertos trastornos que afectan el mecanismo de la inmunidad", "D60-D64", "Anemias aplásticas y otras anemias", "D60_D64"],
  ["D65", "D69", "III", "Enfermedades de la sangre y de los órganos hematopoyéticos, y ciertos trastornos que afectan el mecanismo de la inmunidad", "D65-D69", "Defectos de la coagulación, púrpura y otras afecciones hemorrágicas", "D65_D69"],
  ["D70", "D77", "III", "Enfermedades de la sangre y de los órganos hematopoyéticos, y ciertos trastornos que afectan el mecanismo de la inmunidad", "D70-D77", "Otras enfermedades de la sangre y de los órganos hematopoyéticos", "D70_D77"],
  ["D80", "D89", "III", "Enfermedades de la sangre y de los órganos hematopoyéticos, y ciertos trastornos que afectan el mecanismo de la inmunidad", "D80-D89", "Ciertos trastornos que afectan el mecanismo de la inmunidad", "D80_D89"]
];

const payload = JSON.parse(await readFile(INPUT_PATH, "utf8"));
const entries = payload.entries.map((entry) => entry.code === "D14.1"
  ? { ...entry, officialEs: "Tumor benigno de la laringe" }
  : entry);

const countByLetter = (letter) => entries.filter((entry) => entry.code.startsWith(letter)).length;
if (countByLetter("C") !== 539 || countByLetter("D") !== 527) {
  throw new Error(`Conteo oficial inesperado: C=${countByLetter("C")}, D=${countByLetter("D")}`);
}

const codeHashes = Object.fromEntries(["C", "D"].map((letter) => {
  const codes = entries.filter((entry) => entry.code.startsWith(letter)).map((entry) => entry.code).sort();
  return [letter, createHash("sha256").update(codes.join("\n")).digest("hex")];
}));

const dataLines = entries.map((entry) => `  ${JSON.stringify([
  entry.code,
  entry.officialEs,
  entry.officialEn,
  entry.level,
  entry.terminal,
  entry.usage,
  entry.chapter,
  entry.groupStart,
  entry.rawCode,
  entry.asterisk
])}`).join(",\n");

const runtime = String.raw`
/* CIE10_CD_GENERATED_START */
const FUENTES_CLINICAS_CIE10_CD = __SOURCES__;
const PERFILES_CLINICOS_CIE10_CD = __PROFILES__;
const REGLAS_FARMACOLOGICAS_CIE10_CD = __RULES__;
const GRUPOS_CIE10_CD = __GROUPS__;
const DATOS_CIE10_CD = [
__DATA__
];

const CATEGORIAS_CIE10_CD = new Map(
  DATOS_CIE10_CD.filter((fila) => fila[3] === 3).map((fila) => [fila[0], { nombreEs: fila[1], nombreEn: fila[2] }])
);

function numeroCategoriaCie10CD(codigo) {
  return Number(String(codigo).slice(1, 3));
}

function grupoCie10CD(codigo) {
  const letra = String(codigo).charAt(0);
  const numero = numeroCategoriaCie10CD(codigo);
  return GRUPOS_CIE10_CD.find((grupo) =>
    grupo[0].charAt(0) === letra
    && numero >= numeroCategoriaCie10CD(grupo[0])
    && numero <= numeroCategoriaCie10CD(grupo[1])
  );
}

function perfilCie10CD(codigo, grupo) {
  if (String(codigo).startsWith("C44")) return PERFILES_CLINICOS_CIE10_CD.C44;
  return PERFILES_CLINICOS_CIE10_CD[grupo[6]];
}

function slugCie10CD(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function panelCie10CD(codigo, titulo, textos, orden) {
  return {
    id: slugCie10CD(codigo + "-" + titulo),
    clave: titulo,
    titulo,
    tipo: "resumen_estructurado",
    introduccion: "",
    literal: false,
    listType: "none",
    grupos: [],
    items: textos.filter(Boolean).map((texto, indice) => ({
      numero: null,
      marcador: null,
      texto,
      orden: indice + 1,
      literal: false
    })),
    orden
  };
}

function referenciasCie10CD(codigo, perfil) {
  const capituloPaho = codigo.charAt(0) === "C" || numeroCategoriaCie10CD(codigo) <= 48
    ? FUENTES_CLINICAS_CIE10_CD.paho2
    : FUENTES_CLINICAS_CIE10_CD.paho3;
  return [...new Set([
    FUENTES_CLINICAS_CIE10_CD.who,
    FUENTES_CLINICAS_CIE10_CD.metadata,
    capituloPaho,
    FUENTES_CLINICAS_CIE10_CD.spanishVolume,
    ...(perfil.fuentesClinicas || [])
  ])];
}

function crearPanelesCie10CD(fila, grupo, perfil, aliases) {
  const [codigo, nombreEs, , nivel, terminal, , , , codigoCrudo, asterisco] = fila;
  const nivelTexto = nivel === 3 ? "categoría" : "subcategoría";
  const referencias = referenciasCie10CD(codigo, perfil);
  const notaAsterisco = asterisco
    ? "Código con asterisco: representa una manifestación en una enfermedad clasificada en otra parte y debe acompañarse del código etiológico conforme a la lista tabular."
    : "";
  return [
    panelCie10CD(codigo, "CIE-10", [
      "Código " + codigo + (asterisco ? "*" : "") + ". Nivel oficial: " + nivelTexto + (terminal ? ", utilizable como código terminal." : ", categoría no terminal."),
      "Capítulo " + grupo[2] + ": " + grupo[3] + ". Grupo " + grupo[4] + ": " + grupo[5] + ".",
      "Nombre oficial en español: “" + nombreEs + "”. Sinónimos indexados: " + aliases.filter((alias) => alias !== codigo && alias !== nombreEs).join("; ") + ".",
      notaAsterisco || (codigoCrudo !== codigo ? "Forma tabular OMS: " + codigoCrudo + "." : "")
    ], 1),
    panelCie10CD(codigo, "Definición", [
      "Definición clínica: " + perfil.definicionClinica,
      "Epidemiología: " + perfil.epidemiologia
    ], 2),
    panelCie10CD(codigo, "Etiología", [perfil.etiologia], 3),
    panelCie10CD(codigo, "Agente causal", [perfil.agenteCausal], 4),
    panelCie10CD(codigo, "Manifestaciones clínicas", [perfil.manifestacionesClinicas], 5),
    panelCie10CD(codigo, "Diagnóstico", [perfil.criteriosDiagnosticos, "La asignación del código exige correlación clínica y revisión de inclusiones, exclusiones y reglas de codificación; la CIE-10 no sustituye criterios especializados."], 6),
    panelCie10CD(codigo, "Laboratorios", [perfil.laboratoriosRecomendados], 7),
    panelCie10CD(codigo, "Imagen", [perfil.estudiosImagen], 8),
    panelCie10CD(codigo, "Diagnóstico diferencial", [perfil.diagnosticoDiferencial], 9),
    panelCie10CD(codigo, "Tratamiento", ["Tratamiento inicial: " + perfil.tratamientoInicial, "Tratamiento específico: " + perfil.tratamientoEspecifico], 10),
    panelCie10CD(codigo, "Complicaciones", [perfil.complicaciones], 11),
    panelCie10CD(codigo, "Prevención", [perfil.prevencion], 12),
    panelCie10CD(codigo, "Pronóstico", [perfil.pronostico], 13),
    panelCie10CD(codigo, "Exclusiones", [perfil.exclusiones, notaAsterisco], 14),
    panelCie10CD(codigo, "Referencias", referencias.map((url) => "Fuente oficial o clínica de apoyo: " + url), 15)
  ];
}

function categoriasFarmacologicasCie10CD(codigo) {
  const categorias = [];
  const categoria = codigo.slice(0, 3);
  const numero = numeroCategoriaCie10CD(codigo);
  if (codigo.charAt(0) === "C") categorias.push("neoplasia_maligna");
  if (codigo.startsWith("C50")) categorias.push("cancer_mama_activo");
  if (["C70", "C71", "C72", "D32", "D33", "D42", "D43"].includes(categoria) || ["C79.3", "C79.4"].includes(codigo)) categorias.push("tumor_snc");
  if (codigo.startsWith("D05")) categorias.push("neoplasia_mama_in_situ");
  if (codigo.charAt(0) === "D" && numero <= 9) categorias.push("neoplasia_in_situ");
  if (codigo.charAt(0) === "D" && numero >= 10 && numero <= 36) categorias.push("neoplasia_benigna");
  if (codigo.charAt(0) === "D" && numero >= 37 && numero <= 48) categorias.push("neoplasia_comportamiento_incierto");
  if (codigo.charAt(0) === "D" && numero >= 50 && numero <= 64) categorias.push("anemia");
  if (codigo === "D55.0") categorias.push("deficiencia_g6pd");
  if (codigo.startsWith("D61")) categorias.push("insuficiencia_medular");
  if (codigo.charAt(0) === "D" && numero >= 65 && numero <= 69) categorias.push("trastorno_hemostasia");
  if (["D68.5", "D68.6"].includes(codigo)) categorias.push("trombofilia");
  else if (codigo.charAt(0) === "D" && numero >= 65 && numero <= 69) categorias.push("hemostasia_alterada");
  if (codigo.startsWith("D70")) categorias.push("neutropenia");
  if (codigo.charAt(0) === "D" && numero >= 80) categorias.push("trastorno_inmunitario");
  return [...new Set(categorias)];
}

function reglasFarmacologicasCie10CD(codigo, categorias) {
  const reglas = [];
  if (categorias.includes("cancer_mama_activo")) reglas.push(REGLAS_FARMACOLOGICAS_CIE10_CD.breastHormonal);
  if (categorias.includes("neoplasia_mama_in_situ")) reglas.push(REGLAS_FARMACOLOGICAS_CIE10_CD.breastInSituHormonal);
  if (categorias.includes("tumor_snc")) reglas.push(REGLAS_FARMACOLOGICAS_CIE10_CD.cnsBupropion);
  if (categorias.includes("deficiencia_g6pd")) reglas.push(REGLAS_FARMACOLOGICAS_CIE10_CD.g6pdTmpSmx);
  if (categorias.includes("insuficiencia_medular")) reglas.push(REGLAS_FARMACOLOGICAS_CIE10_CD.marrowMyelosuppression);
  if (categorias.includes("hemostasia_alterada")) reglas.push(REGLAS_FARMACOLOGICAS_CIE10_CD.bleedingRisk);
  if (categorias.includes("trombofilia")) reglas.push(REGLAS_FARMACOLOGICAS_CIE10_CD.thrombophiliaHormonal);
  if (categorias.includes("neutropenia")) reglas.push(REGLAS_FARMACOLOGICAS_CIE10_CD.clozapineNeutropenia);
  return reglas;
}

function crearFarmacologiaCie10CD(codigo) {
  const categorias = categoriasFarmacologicasCie10CD(codigo);
  const reglas = reglasFarmacologicasCie10CD(codigo, categorias);
  const valores = (campo) => [...new Set(reglas.flatMap((regla) => regla.medicamento?.[campo] || []))];
  const precauciones = reglas.filter((regla) => regla.tipo !== "contraindicacion");
  return {
    versionEsquema: "1.0.0",
    estadoCobertura: reglas.length ? "reglas_especificas_disponibles" : "sin_regla_especifica_cargada",
    requiereAdvertencia: reglas.length > 0,
    ausenciaReglaNoImplicaSeguridad: true,
    notaCobertura: reglas.length
      ? "Aplicar estas reglas solo cuando coexistan el diagnóstico y un medicamento coincidente; confirmar actividad, dosis, vía, función orgánica y ficha técnica vigente."
      : "No hay una regla medicamento-diagnóstico específica cargada para este código. Esto no demuestra seguridad ni ausencia de interacciones.",
    categoriasRiesgo: categorias,
    medicamentosRelacionados: { ingredientes: valores("ingredientes"), clases: valores("clases"), riesgos: valores("riesgos") },
    contraindicaciones: reglas.filter((regla) => regla.tipo === "contraindicacion"),
    precauciones,
    vigilancia: precauciones,
    reglas
  };
}

function aliasesCie10CD(codigo, nombreEs, nombreEn, categoria) {
  const aliases = [codigo, nombreEs, nombreEn, categoria?.nombreEs, categoria?.nombreEn];
  if (nombreEs.startsWith("Tumor maligno")) {
    aliases.push(nombreEs.replace(/^Tumor maligno/, "Cáncer"));
    aliases.push(nombreEs.replace(/^Tumor maligno/, "Neoplasia maligna"));
  }
  if (nombreEs.startsWith("Tumor benigno")) aliases.push(nombreEs.replace(/^Tumor benigno/, "Neoplasia benigna"));
  if (nombreEs.includes("comportamiento incierto o desconocido")) aliases.push(nombreEs.replace(/^Tumor/, "Neoplasia"));
  return [...new Set(aliases.filter(Boolean))];
}

function crearDiagnosticoCie10CD(fila) {
  const [codigo, nombreEs, nombreEn, nivel, terminal, usoOms, capituloMetadata, grupoInicial, codigoCrudo, asterisco] = fila;
  const grupo = grupoCie10CD(codigo);
  if (!grupo) throw new Error("Código CIE-10 C/D sin grupo oficial: " + codigo);
  const categoriaCodigo = codigo.slice(0, 3);
  const categoria = CATEGORIAS_CIE10_CD.get(categoriaCodigo) || { nombreEs, nombreEn };
  const perfil = perfilCie10CD(codigo, grupo);
  const aliases = aliasesCie10CD(codigo, nombreEs, nombreEn, categoria);
  const referenciasUrls = referenciasCie10CD(codigo, perfil);
  const sistema = {
    visible: true,
    orden: 1,
    codigo,
    nombre: nombreEs,
    jerarquia: {
      capitulo: { codigo: grupo[2], nombre: grupo[3] },
      grupo: { codigo: grupo[4], nombre: grupo[5] },
      categoria: { codigo: categoriaCodigo, nombre: categoria.nombreEs },
      subcategoria: nivel === 4 ? { codigo, nombre: nombreEs } : null
    },
    especificadores: asterisco ? ["Código con asterisco: requiere código de la enfermedad subyacente."] : [],
    notas: [
      "Código, jerarquía y nombre inglés comprobados contra metadata oficial OMS 2019.",
      "Nombre español comprobado contra OPS/OMS y el Volumen 1 CIE-10 2018.",
      "El resumen clínico es orientativo y requiere guía específica de la entidad."
    ],
    fuente: {
      organismo: "World Health Organization / Organización Panamericana de la Salud",
      documento: "ICD-10 Version 2019 y CIE-10 Volumen 1 en español",
      edicion: "OMS 2019; nomenclatura española 2018",
      url: FUENTES_CLINICAS_CIE10_CD.who,
      metadataUrl: FUENTES_CLINICAS_CIE10_CD.metadata,
      nomenclaturaEspanolUrl: codigo.charAt(0) === "C" || numeroCategoriaCie10CD(codigo) <= 48 ? FUENTES_CLINICAS_CIE10_CD.paho2 : FUENTES_CLINICAS_CIE10_CD.paho3,
      volumenEspanolUrl: FUENTES_CLINICAS_CIE10_CD.spanishVolume,
      sourceVerified: true
    },
    nombreOficialOms: nombreEn,
    nombreOficialEs: nombreEs,
    subtipos: [],
    tipoContenido: "resumen_clinico_estructurado_no_literal",
    completionStatus: "complete",
    review: {
      reviewed: false,
      reviewedAt: null,
      sourceVerified: true,
      notes: "Nomenclatura y jerarquía verificadas; el manejo debe confirmarse con una guía específica del diagnóstico."
    },
    contenidoLiteralAutorizado: false
  };
  let criteriosCache = null;
  Object.defineProperty(sistema, "criterios", {
    enumerable: true,
    configurable: false,
    get() {
      if (!criteriosCache) criteriosCache = crearPanelesCie10CD(fila, grupo, perfil, aliases);
      return criteriosCache;
    }
  });
  const propiedadesClinicas = {
    sinonimosMedicos: aliases,
    definicionClinica: perfil.definicionClinica,
    etiologia: perfil.etiologia,
    agenteCausal: perfil.agenteCausal,
    epidemiologia: perfil.epidemiologia,
    manifestacionesClinicas: perfil.manifestacionesClinicas,
    criteriosDiagnosticos: perfil.criteriosDiagnosticos,
    laboratoriosRecomendados: perfil.laboratoriosRecomendados,
    estudiosImagen: perfil.estudiosImagen,
    diagnosticoDiferencial: perfil.diagnosticoDiferencial,
    complicaciones: perfil.complicaciones,
    tratamientoInicial: perfil.tratamientoInicial,
    tratamientoEspecifico: perfil.tratamientoEspecifico,
    prevencion: perfil.prevencion,
    pronostico: perfil.pronostico,
    exclusiones: perfil.exclusiones
  };
  const propiedadesFuente = {
    completionStatus: "complete",
    review: sistema.review,
    fuente: sistema.fuente,
    clasificacionOficial: {
      nivel,
      terminal,
      usoOms,
      capitulo: capituloMetadata,
      grupoInicial,
      codigoTabular: codigoCrudo,
      codigoAsterisco: Boolean(asterisco)
    },
    fuenteNomenclaturaEs: {
      organismo: "Organización Panamericana de la Salud / Organización Mundial de la Salud",
      documento: "CIE-10, Volumen 1, edición 2018",
      idioma: "es",
      url: FUENTES_CLINICAS_CIE10_CD.spanishVolume,
      sourceVerified: true
    },
    clinicas: propiedadesClinicas
  };
  return {
    id: "cie10-" + codigo.toLowerCase().replace(".", "-"),
    codigo,
    nombre: nombreEs,
    aliases,
    descripcionBreve: nombreEs + " (" + codigo + ").",
    categoria: grupo[3],
    subcategoria: grupo[5],
    sistemas: { cie10: sistema },
    propiedades: propiedadesFuente,
    nombreOficialOms: nombreEn,
    nombreOficialEs: nombreEs,
    farmacologia: crearFarmacologiaCie10CD(codigo),
    diagnosticoDiferencial: [perfil.diagnosticoDiferencial],
    comorbilidades: [],
    evaluacionClinica: [perfil.criteriosDiagnosticos, perfil.laboratoriosRecomendados],
    referencias: referenciasUrls.map((url) => ({ sistema: "CIE-10 / apoyo clínico oficial", organismo: new URL(url).hostname, titulo: url, url, tipoContenido: "Fuente oficial o clínica de apoyo" })),
    psicoeducacion: "Información orientativa. El código clasifica la condición, pero no sustituye evaluación, patología, gravedad, estadio ni una guía clínica específica.",
    propiedadesPorFuente: { cie10: propiedadesFuente, cie11: null, dsm5: null },
    vinculos: { capitulo: grupo[2], grupo: grupo[4], categoriaPadre: nivel === 4 ? categoriaCodigo : null }
  };
}

function crearDiagnosticosCie10CD() {
  return DATOS_CIE10_CD.map(crearDiagnosticoCie10CD);
}
/* CIE10_CD_GENERATED_END */
`;

const generatedBlock = runtime
  .replace("__SOURCES__", JSON.stringify(CLINICAL_SOURCES, null, 2))
  .replace("__PROFILES__", JSON.stringify(PROFILES, null, 2))
  .replace("__RULES__", JSON.stringify(RULES, null, 2))
  .replace("__GROUPS__", JSON.stringify(GROUPS, null, 2))
  .replace("__DATA__", dataLines);

let source = await readFile(CATALOG_PATH, "utf8");
source = source.replace(/\/\* CIE10_CD_GENERATED_START \*\/[\s\S]*?\/\* CIE10_CD_GENERATED_END \*\/\r?\n?/g, "");
source = source.replace(/\s*\.\.\.crearDiagnosticosCie10CD\(\),\r?\n/g, "\n");

const exportMarker = "export const CATALOGO_DIAGNOSTICOS = [";
if (!source.includes(exportMarker)) throw new Error("No se encontró la exportación del catálogo.");
source = source.replace(exportMarker, generatedBlock + "\n" + exportMarker);

const e00Marker = '  {\n    "id": "cie10-e00",';
if (!source.includes(e00Marker)) throw new Error("No se encontró el punto de inserción anterior a E00.");
source = source.replace(e00Marker, "  ...crearDiagnosticosCie10CD(),\n" + e00Marker);

const oldMetadataMatch = source.match(/export const METADATOS_CATALOGO_DIAGNOSTICOS = \{[\s\S]*?\n\};\s*$/);
if (!oldMetadataMatch) throw new Error("No se encontró metadata final del catálogo.");
const metadata = {
  version: "2026.08.13",
  generadoEn: new Date().toISOString(),
  archivo: "js/data/catalogoDiagnosticos.js",
  fuenteUnica: true,
  integridad: {
    cie10Edicion: "OMS 2019",
    comparadoConMetadataOficial: true,
    codigosAbfOficiales: 1391,
    codigosAbfFaltantes: 0,
    codigosAbfAdicionales: 0,
    codigosCOficiales: 539,
    codigosCFaltantes: 0,
    codigosCAdicionales: 0,
    codigosDOficiales: 527,
    codigosDFaltantes: 0,
    codigosDAdicionales: 0,
    sha256CodigosC: codeHashes.C,
    sha256CodigosD: codeHashes.D,
    codigosLegacyConservados: 575,
    codigosLegacyOmitidos: 0
  },
  notasEdicion: [
    "Se incorporaron íntegros los capítulos C00-C97 y D00-D89 disponibles en la metadata OMS ICD-10 2019.",
    "D63, D63.0, D63.8 y D77 conservan su condición oficial de códigos con asterisco y son buscables sin el símbolo.",
    "Los detalles clínicos C/D se construyen al expandir la entidad a partir de perfiles fuente únicos dentro de este mismo archivo."
  ],
  sistemas: { cie10: { total: 2804 }, cie11: { total: 28 }, dsm5: { total: 12 } }
};
source = source.replace(oldMetadataMatch[0], "export const METADATOS_CATALOGO_DIAGNOSTICOS = " + JSON.stringify(metadata, null, 2) + ";\n");

await writeFile(CATALOG_PATH, source, "utf8");
console.log(JSON.stringify({
  catalogo: CATALOG_PATH,
  agregados: entries.length,
  C: countByLetter("C"),
  D: countByLetter("D"),
  sha256C: codeHashes.C,
  sha256D: codeHashes.D
}, null, 2));
