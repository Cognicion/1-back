/**
 * Complemento regulatorio para antibacterianos.
 *
 * FDA y COFEPRIS cumplen funciones distintas: las advertencias clínicas se
 * citan desde documentos de seguridad/etiquetado de FDA; el visor COFEPRIS
 * sirve para consultar registros sanitarios mexicanos y no se presenta como
 * sustituto de la información para prescribir.
 */

const URL_FDA_LABELS = "https://labels.fda.gov/";
const URL_COFEPPRIS_REGISTROS = "https://registros.cofepris.gob.mx/BRSDM/";
const URL_FDA_FLUOROQUINOLONAS = "https://www.fda.gov/media/119537/download?attachment=";
const URL_FDA_FLUOROQUINOLONAS_GLUCOSA = "https://www.fda.gov/media/114192/download";

function fuenteFDA(nombre) {
  return Object.freeze({
    organismo: "FDA",
    tipo: "repositorio de etiquetado",
    titulo: `FDA Online Label Repository: ${nombre}`,
    url: URL_FDA_LABELS,
    alcance: "Localiza el etiquetado del producto estadounidense; confirmar la presentación y la revisión vigente antes de usarlo clínicamente."
  });
}

function fuenteCOFEPRIS(nombre) {
  return Object.freeze({
    organismo: "COFEPRIS",
    tipo: "consulta de registro sanitario",
    titulo: `Visor de Registros de Medicamentos: ${nombre}`,
    url: URL_COFEPPRIS_REGISTROS,
    alcance: "Consulta por denominación genérica o principio activo. El visor confirma registros autorizados cuando se consulta el producto, pero no sustituye la información para prescribir."
  });
}

function advertenciasFluoroquinolona() {
  return Object.freeze([
    Object.freeze({
      id: "fda-fluoroquinolonas-reacciones-discapacitantes",
      titulo: "Advertencia FDA de clase: reacciones graves potencialmente incapacitantes",
      texto: "La FDA describe reacciones graves que pueden coexistir y aconseja suspender el tratamiento ante signos de afectación de tendones, músculos, articulaciones, nervios periféricos o sistema nervioso central; valorar una alternativa no fluoroquinolona cuando sea posible.",
      severidad: "alta",
      categoria: "advertencia_regulatoria",
      fuentes: Object.freeze([
        Object.freeze({
          organismo: "FDA",
          tipo: "comunicación de seguridad",
          titulo: "FDA Drug Safety Communication: fluoroquinolonas orales e inyectables",
          url: URL_FDA_FLUOROQUINOLONAS,
          seccion: "Additional Information for Health Care Professionals"
        })
      ])
    }),
    Object.freeze({
      id: "fda-fluoroquinolonas-glucosa-salud-mental",
      titulo: "Advertencia FDA de clase: glucosa y reacciones psiquiátricas",
      texto: "La FDA requirió cambios de etiquetado para advertir alteraciones importantes de glucosa, incluida hipoglucemia grave, y reacciones adversas de salud mental; individualizar el riesgo y vigilar en pacientes susceptibles.",
      severidad: "alta",
      categoria: "advertencia_regulatoria",
      fuentes: Object.freeze([
        Object.freeze({
          organismo: "FDA",
          tipo: "comunicación de seguridad",
          titulo: "FDA Drug Safety Communication: cambios de glucosa y salud mental con fluoroquinolonas",
          url: URL_FDA_FLUOROQUINOLONAS_GLUCOSA,
          seccion: "Hypoglycemic Coma; Psychiatric Adverse Reactions"
        })
      ])
    })
  ]);
}

const IDS_FLUOROQUINOLONAS = new Set([
  "ciprofloxacino", "levofloxacino", "moxifloxacino", "gatifloxacino", "sparfloxacino",
  "delafloxacino", "gemifloxacino", "ofloxacino", "norfloxacino"
]);

function fuenteClinicaRegulatoria(nombre) {
  return {
    estado: "fuente_regulatoria_parcial",
    fuente: "FDA y COFEPRIS: trazabilidad regulatoria parcial",
    fuentes: [
      `FDA Online Label Repository: ${nombre}`,
      `COFEPRIS Visor de Registros de Medicamentos: consulta por ${nombre}`
    ],
    paginaSeccion: "Advertencias: sólo se muestran con una cita regulatoria específica; las demás propiedades requieren extracción y revisión por molécula.",
    confianza: "regulatoria parcial"
  };
}

function detalleRegulatorio(nombre, id) {
  return {
    fuentesRegulatorias: Object.freeze([fuenteFDA(nombre), fuenteCOFEPRIS(nombre)]),
    fuenteClinica: fuenteClinicaRegulatoria(nombre),
    referencias: [
      `FDA Online Label Repository: ${nombre} (${URL_FDA_LABELS}).`,
      `COFEPRIS, Visor de Registros de Medicamentos: consulta por denominación genérica/principio activo (${URL_COFEPPRIS_REGISTROS}).`
    ],
    datosClinicos: {
      advertenciasEstructuradas: IDS_FLUOROQUINOLONAS.has(id) ? advertenciasFluoroquinolona() : []
    }
  };
}

const ANTIBIOTICOS_EXISTENTES = [
  ["amoxicilina", "Amoxicilina"],
  ["amoxicilina_clavulanato", "Amoxicilina/clavulanato"],
  ["azitromicina", "Azitromicina"],
  ["cefalexina", "Cefalexina"],
  ["ceftriaxona", "Ceftriaxona"],
  ["cefuroxima", "Cefuroxima"],
  ["ciprofloxacino", "Ciprofloxacino"],
  ["claritromicina", "Claritromicina"],
  ["doxiciclina", "Doxiciclina"],
  ["eritromicina", "Eritromicina"],
  ["gatifloxacino", "Gatifloxacino"],
  ["gentamicina", "Gentamicina"],
  ["levofloxacino", "Levofloxacino"],
  ["linezolid", "Linezolid"],
  ["meropenem", "Meropenem"],
  ["metronidazol", "Metronidazol"],
  ["moxifloxacino", "Moxifloxacino"],
  ["mupirocina", "Mupirocina"],
  ["rifampicina", "Rifampicina"],
  ["rifaximina", "Rifaximina"],
  ["sparfloxacino", "Sparfloxacino"],
  ["sulfadiazina_de_plata", "Sulfadiazina de plata"],
  ["isoniazida", "Isoniazida"]
];

/** Actualizaciones no destructivas para entradas que ya pertenecían al catálogo. */
export const ACTUALIZACIONES_ANTIBIOTICOS_REGULATORIAS = Object.freeze(new Map(
  ANTIBIOTICOS_EXISTENTES.map(([id, nombre]) => [id, Object.freeze(detalleRegulatorio(nombre, id))])
));

const ANTIBIOTICOS_ADICIONALES_DEFINICION = [
  ["ampicilina", "Ampicilina", "Penicilina aminopenicilina"],
  ["ampicilina_sulbactam", "Ampicilina/sulbactam", "Beta-lactámico con inhibidor de beta-lactamasa"],
  ["penicilina_g", "Penicilina G", "Penicilina natural"],
  ["penicilina_v", "Penicilina V", "Penicilina natural"],
  ["dicloxacilina", "Dicloxacilina", "Penicilina resistente a penicilinasa"],
  ["oxacilina", "Oxacilina", "Penicilina resistente a penicilinasa"],
  ["piperacilina_tazobactam", "Piperacilina/tazobactam", "Ureidopenicilina con inhibidor de beta-lactamasa"],
  ["cefazolina", "Cefazolina", "Cefalosporina de primera generación"],
  ["cefadroxilo", "Cefadroxilo", "Cefalosporina de primera generación"],
  ["cefaclor", "Cefaclor", "Cefalosporina de segunda generación"],
  ["cefprozil", "Cefprozil", "Cefalosporina de segunda generación"],
  ["cefixima", "Cefixima", "Cefalosporina de tercera generación"],
  ["cefdinir", "Cefdinir", "Cefalosporina de tercera generación"],
  ["cefpodoxima", "Cefpodoxima", "Cefalosporina de tercera generación"],
  ["cefotaxima", "Cefotaxima", "Cefalosporina de tercera generación"],
  ["ceftazidima", "Ceftazidima", "Cefalosporina de tercera generación"],
  ["cefepima", "Cefepima", "Cefalosporina de cuarta generación"],
  ["ceftarolina", "Ceftarolina", "Cefalosporina de quinta generación"],
  ["ceftolozano_tazobactam", "Ceftolozano/tazobactam", "Cefalosporina con inhibidor de beta-lactamasa"],
  ["ceftazidima_avibactam", "Ceftazidima/avibactam", "Cefalosporina con inhibidor de beta-lactamasa"],
  ["cefiderocol", "Cefiderocol", "Cefalosporina siderófora"],
  ["ertapenem", "Ertapenem", "Carbapenémico"],
  ["imipenem_cilastatina", "Imipenem/cilastatina", "Carbapenémico con inhibidor de dehidropeptidasa I"],
  ["doripenem", "Doripenem", "Carbapenémico"],
  ["aztreonam", "Aztreonam", "Monobactámico"],
  ["tetraciclina", "Tetraciclina", "Tetraciclina"],
  ["minociclina", "Minociclina", "Tetraciclina"],
  ["tigeciclina", "Tigeciclina", "Glicilciclina"],
  ["omadaciclina", "Omadaciclina", "Aminometilciclina"],
  ["eravaciclina", "Eravaciclina", "Fluorociclina"],
  ["amikacina", "Amikacina", "Aminoglucósido"],
  ["tobramicina", "Tobramicina", "Aminoglucósido"],
  ["estreptomicina", "Estreptomicina", "Aminoglucósido"],
  ["plazomicina", "Plazomicina", "Aminoglucósido"],
  ["vancomicina", "Vancomicina", "Glucopéptido"],
  ["daptomicina", "Daptomicina", "Lipoglucopéptido"],
  ["dalbavancina", "Dalbavancina", "Lipoglucopéptido"],
  ["oritavancina", "Oritavancina", "Lipoglucopéptido"],
  ["telavancina", "Telavancina", "Lipoglucopéptido"],
  ["tedizolid", "Tedizolid", "Oxazolidinona"],
  ["delafloxacino", "Delafloxacino", "Fluoroquinolona"],
  ["gemifloxacino", "Gemifloxacino", "Fluoroquinolona"],
  ["ofloxacino", "Ofloxacino", "Fluoroquinolona"],
  ["norfloxacino", "Norfloxacino", "Fluoroquinolona"],
  ["clindamicina", "Clindamicina", "Lincosamida"],
  ["trimetoprim_sulfametoxazol", "Trimetoprim/sulfametoxazol", "Inhibidor secuencial del folato"],
  ["trimetoprim", "Trimetoprim", "Inhibidor del folato"],
  ["nitrofurantoina", "Nitrofurantoína", "Nitrofurano antibacteriano"],
  ["fosfomicina", "Fosfomicina", "Derivado del ácido fosfónico"],
  ["rifampicina", "Rifampicina", "Rifamicina"],
  ["rifabutina", "Rifabutina", "Rifamicina"],
  ["rifapentina", "Rifapentina", "Rifamicina"],
  ["colistina", "Colistina", "Polimixina"],
  ["polimixina_b", "Polimixina B", "Polimixina"],
  ["cloranfenicol", "Cloranfenicol", "Amfenicol"],
  ["quinupristina_dalfopristina", "Quinupristina/dalfopristina", "Estreptogramina"],
  ["fidaxomicina", "Fidaxomicina", "Macrocíclico antibacteriano"],
  ["bacitracina", "Bacitracina", "Antibiótico polipeptídico tópico"],
  ["isoniazida", "Isoniazida", "Antimicobacteriano"],
  ["etambutol", "Etambutol", "Antimicobacteriano"],
  ["pirazinamida", "Pirazinamida", "Antimicobacteriano"],
  ["bedaquilina", "Bedaquilina", "Antimicobacteriano"],
  ["pretomanid", "Pretomanid", "Antimicobacteriano" ]
];

function crearAntibioticoAdicional([id, nombre, subclase]) {
  const detalle = detalleRegulatorio(nombre, id);
  const advertencias = detalle.datosClinicos.advertenciasEstructuradas;
  return Object.freeze({
    id,
    legacyIds: [],
    nombre,
    genericName: nombre,
    principioActivo: nombre.toLocaleLowerCase("es"),
    principiosActivos: [nombre, nombre.toLocaleLowerCase("es")],
    clasePrincipal: subclase,
    clases: ["Antibiótico", subclase],
    categoriasInteraccion: [],
    sinonimos: [nombre, nombre.toLocaleLowerCase("es")],
    marcas: [],
    especialidades: ["Infectología"],
    presentaciones: [],
    dosisHabitual: "fuente pendiente de extracción regulatoria por molécula",
    dosisHabituales: [],
    frecuenciasSugeridas: [],
    datosClinicos: {
      indicaciones: [],
      contraindicaciones: [],
      precauciones: [],
      advertencias: advertencias.map((advertencia) => advertencia.texto),
      advertenciasEstructuradas: advertencias,
      monitorizacion: [],
      dosisAdulto: [],
      dosisPediatrica: [],
      embarazo: null,
      lactancia: null
    },
    farmacocinetica: {
      mecanismoAccion: "fuente pendiente de extracción regulatoria por molécula",
      vidaMedia: "fuente pendiente de extracción regulatoria por molécula",
      tiempoConcentracionMaxima: "fuente pendiente de extracción regulatoria por molécula",
      duracionAccion: "",
      metabolismo: "fuente pendiente de extracción regulatoria por molécula",
      eliminacion: "fuente pendiente de extracción regulatoria por molécula",
      cyp: [],
      metabolitosActivos: []
    },
    efectosAdversos: [],
    riesgos: {},
    interacciones: [],
    interaccionesRelacionadas: [],
    relacionDiagnosticos: [],
    notas: "Entrada normalizada. No usar como dosificación ni como sustituto de la información para prescribir; las propiedades pendientes no se infieren.",
    referencias: detalle.referencias,
    fuenteClinica: detalle.fuenteClinica,
    fuentesRegulatorias: detalle.fuentesRegulatorias,
    farmacologia: {
      esquema: "cognicion.farmacologia.v1",
      id,
      nombreGenerico: nombre,
      estadoFuente: "fuente_regulatoria_parcial",
      fuente: "FDA y COFEPRIS: trazabilidad regulatoria parcial"
    },
    pediatria: null,
    origenesCatalogo: ["catalogo_antibioticos_regulatorio"],
    activo: true,
    estadoContenido: "extraccion_regulatoria_pendiente",
    actualizadoEn: "2026-08-22"
  });
}

export const ANTIBIOTICOS_ADICIONALES_REGULATORIOS = Object.freeze(
  ANTIBIOTICOS_ADICIONALES_DEFINICION.map(crearAntibioticoAdicional)
);

function unirTexto(...listas) {
  return [...new Set(listas.flat().filter(Boolean))];
}

function integrarDatosClinicos(base = {}, complemento = {}) {
  const advertenciasEstructuradas = complemento.advertenciasEstructuradas || [];
  return {
    ...base,
    ...complemento,
    advertencias: unirTexto(base.advertencias || [], complemento.advertencias || [], advertenciasEstructuradas.map((item) => item.texto)),
    advertenciasEstructuradas: advertenciasEstructuradas.length ? advertenciasEstructuradas : (base.advertenciasEstructuradas || [])
  };
}

/**
 * Conserva cada registro existente y sólo añade trazabilidad regulatoria.
 * Las entradas adicionales no reemplazan registros ya presentes.
 */
export function integrarAntibioticosRegulatorios(catalogoBase = []) {
  const existentes = new Set(catalogoBase.map((medicamento) => medicamento.id));
  const enriquecidos = catalogoBase.map((medicamento) => {
    const complemento = ACTUALIZACIONES_ANTIBIOTICOS_REGULATORIAS.get(medicamento.id);
    if (!complemento) return medicamento;
    const fuentesRegulatorias = [...(medicamento.fuentesRegulatorias || []), ...(complemento.fuentesRegulatorias || [])];
    const esAntimicobacteriano = ["rifampicina", "isoniazida"].includes(medicamento.id);
    return {
      ...medicamento,
      clases: unirTexto(medicamento.clases || [], "Antibiótico", esAntimicobacteriano ? "Antimicobacteriano" : ""),
      datosClinicos: integrarDatosClinicos(medicamento.datosClinicos, complemento.datosClinicos),
      referencias: unirTexto(medicamento.referencias || [], complemento.referencias || []),
      fuentesRegulatorias: Object.freeze(fuentesRegulatorias),
      fuenteClinica: complemento.fuenteClinica,
      farmacologia: {
        ...(medicamento.farmacologia || {}),
        estadoFuente: "fuente_regulatoria_parcial",
        fuente: "FDA y COFEPRIS: trazabilidad regulatoria parcial"
      },
      origenesCatalogo: unirTexto(medicamento.origenesCatalogo || [], "catalogo_antibioticos_regulatorio"),
      actualizadoEn: "2026-08-22"
    };
  });
  return [...enriquecidos, ...ANTIBIOTICOS_ADICIONALES_REGULATORIOS.filter((medicamento) => !existentes.has(medicamento.id))];
}
