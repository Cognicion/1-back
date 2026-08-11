const DEFAULT_CONNECTION = Object.freeze({
  tipo: "proyeccion",
  claseEntidad: "conexion",
  direccion: "unidireccional",
  polaridad: "no_especificada",
  tractoFasciculo: null,
  neurotransmisorPrincipal: "no_especificado",
  funcion: "",
  importanciaAprendizaje: "",
  plasticidad: null,
  evidencia: "no_especificada",
  especies: [],
  tiposEvidencia: [],
  etiquetas: [],
  referencias: []
});

function connection(id, origen, destino, nombre, extra = {}) {
  const item = {
    ...DEFAULT_CONNECTION,
    id,
    origen,
    destino,
    nombre,
    ...extra,
    especies: Object.freeze([...(extra.especies || [])]),
    tiposEvidencia: Object.freeze([...(extra.tiposEvidencia || [])]),
    etiquetas: Object.freeze([...(extra.etiquetas || [])]),
    referencias: Object.freeze([...(extra.referencias || [])]),
    plasticidad: extra.plasticidad ? Object.freeze({ ...extra.plasticidad }) : null
  };
  return Object.freeze(item);
}

/**
 * Registro unico de aristas anatomicas/funcionales. La pertenencia a circuitos
 * se deriva en connectomeData.js desde brainCircuits para evitar dos fuentes de
 * verdad. Los tractos que necesitan seleccion o lesion propia son nodos.
 */
export const BRAIN_CONNECTIONS_BASE = Object.freeze([
  connection("via_perforante_ec_dg", "corteza_entorrinal", "giro_dentado", "Via perforante", {
    tipo: "via",
    claseEntidad: "via",
    tractoFasciculo: "Via perforante",
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Entrada cortical principal al giro dentado desde capas superficiales entorrinales.",
    importanciaAprendizaje: "Introduce informacion cortical en la secuencia trisináptica y es un sitio de plasticidad dependiente de actividad.",
    plasticidad: { tipos: ["LTP", "LTD"], nota: "Via utilizada en estudios de plasticidad; los mecanismos dependen de capa, celula y protocolo.", evidencia: "establecida" },
    evidencia: "establecida",
    especies: ["roedor", "lagomorfo", "primate"],
    tiposEvidencia: ["trazado_anatomico", "electrofisiologia", "revision"],
    etiquetas: ["memoria", "plasticidad", "procesamiento_patrones"],
    referencias: ["amaral_witter_1989", "van_strien_2009", "malenka_bear_2004"]
  }),
  connection("fibras_musgosas_dg_ca3", "giro_dentado", "ca3", "Fibras musgosas", {
    tipo: "via",
    claseEntidad: "via",
    tractoFasciculo: "Fibras musgosas hipocampales",
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Proyeccion de celulas granulares del giro dentado hacia neuronas piramidales e interneuronas de CA3.",
    importanciaAprendizaje: "Transmite una representacion escasa hacia la red recurrente de CA3.",
    plasticidad: { tipos: ["LTP presinaptica"], nota: "Presenta formas de plasticidad con propiedades distintas de la sinapsis CA3-CA1.", evidencia: "establecida" },
    evidencia: "establecida",
    especies: ["roedor", "primate"],
    tiposEvidencia: ["trazado_anatomico", "electrofisiologia", "revision"],
    etiquetas: ["memoria", "plasticidad", "procesamiento_patrones"],
    referencias: ["amaral_witter_1989", "malenka_bear_2004"]
  }),
  connection("colaterales_schaffer_ca3_ca1", "ca3", "ca1", "Colaterales de Schaffer", {
    tipo: "via",
    claseEntidad: "via",
    tractoFasciculo: "Colaterales de Schaffer",
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Proyeccion glutamatergica de neuronas piramidales CA3 a dendritas de CA1.",
    importanciaAprendizaje: "Sinapsis modelo para estudiar LTP/LTD y asociar cambios sinapticos con aprendizaje.",
    plasticidad: { tipos: ["LTP", "LTD"], nota: "Sitio clasico de plasticidad NMDA-dependiente; no representa todos los mecanismos de memoria.", evidencia: "establecida" },
    evidencia: "establecida",
    especies: ["roedor", "primate"],
    tiposEvidencia: ["trazado_anatomico", "electrofisiologia", "revision"],
    etiquetas: ["memoria", "plasticidad", "procesamiento_patrones", "NMDA", "AMPA"],
    referencias: ["amaral_witter_1989", "bliss_collingridge_1993", "malenka_bear_2004"]
  }),
  connection("proyeccion_ca1_subiculo", "ca1", "subiculo", "Salida CA1-subiculo", {
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Transfiere informacion procesada desde CA1 hacia una interfaz mayor de salida hipocampal.",
    importanciaAprendizaje: "Participa en distribuir resultados del procesamiento hipocampal a redes corticales y diencefalicas.",
    etiquetas: ["memoria", "salida_hipocampal"],
    referencias: ["amaral_witter_1989", "van_strien_2009"]
  }),
  connection("proyeccion_subiculo_entorrinal", "subiculo", "corteza_entorrinal", "Proyeccion subiculo-entorrinal", {
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Ruta de retorno desde formacion hipocampal hacia capas profundas entorrinales.",
    importanciaAprendizaje: "Cierra bucles cortico-hipocampales y facilita redistribucion cortical de informacion.",
    etiquetas: ["memoria", "consolidacion"],
    referencias: ["van_strien_2009"]
  }),
  connection("via_temporoamonica_ec_ca1", "corteza_entorrinal", "ca1", "Via temporoamonica", {
    tipo: "via",
    claseEntidad: "via",
    tractoFasciculo: "Via temporoamonica",
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Entrada entorrinal relativamente directa a CA1 que converge con informacion procedente de CA3.",
    importanciaAprendizaje: "Permite comparar o integrar corrientes de entrada directas e indirectas, segun modelos funcionales.",
    plasticidad: { tipos: ["LTP", "LTD"], nota: "Plasticidad dependiente del patron y de la modulacion local.", evidencia: "establecida" },
    evidencia: "no_especificada",
    etiquetas: ["memoria", "plasticidad", "procesamiento_patrones"],
    referencias: ["van_strien_2009", "malenka_bear_2004"]
  }),
  connection("recurrentes_ca3", "ca3", "ca3", "Colaterales recurrentes de CA3", {
    tipo: "conexion_recurrente",
    claseEntidad: "conexion",
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Interconecta neuronas CA3 dentro de una red autoasociativa con inhibicion local asociada.",
    importanciaAprendizaje: "Sustenta modelos de memoria asociativa y completamiento de patrones.",
    plasticidad: { tipos: ["LTP", "LTD"], nota: "Plasticidad recurrente relevante para modelos autoasociativos.", evidencia: "probable" },
    evidencia: "modelo_funcional",
    especies: ["roedor"],
    tiposEvidencia: ["lesion", "manipulacion_receptores", "modelo_computacional", "revision"],
    etiquetas: ["memoria", "procesamiento_patrones", "plasticidad"],
    referencias: ["nakazawa_2002", "amaral_witter_1989"]
  }),
  connection("proyeccion_ca2_ca1", "ca2", "ca1", "Proyeccion CA2-CA1", {
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Conecta el subcampo CA2 con CA1 dentro de la formacion hipocampal.",
    importanciaAprendizaje: "Aporta informacion de un subcampo con propiedades distintas a CA1.",
    etiquetas: ["memoria"],
    referencias: ["kandel_2021"]
  }),

  connection("subiculo_fornix", "subiculo", "fornix", "Eferencias hipocampales hacia fornix", {
    tipo: "proyeccion_por_tracto",
    claseEntidad: "conexion",
    tractoFasciculo: "Fimbria-fornix",
    funcion: "Incorpora axones subiculares e hipocampales al sistema fimbria-fornix.",
    importanciaAprendizaje: "Conecta la formacion hipocampal con estructuras septales y diencefalicas.",
    etiquetas: ["memoria", "circuito_papez"],
    referencias: ["aggleton_brown_1999", "papez_1937"]
  }),
  connection("fornix_cuerpos_mamilares", "fornix", "cuerpos_mamilares", "Fornix poscomisural", {
    tipo: "proyeccion_por_tracto",
    claseEntidad: "conexion",
    tractoFasciculo: "Fornix poscomisural",
    funcion: "Proyeccion predominante desde subiculo/hipocampo hacia cuerpos mamilares.",
    importanciaAprendizaje: "Integra el eje hipocampo-diencefalo implicado en memoria episodica.",
    etiquetas: ["memoria", "circuito_papez"],
    referencias: ["aggleton_brown_1999", "papez_1937"]
  }),
  connection("cuerpos_mamilares_tracto_mtt", "cuerpos_mamilares", "tracto_mamilotalamico", "Origen del tracto mamilotalamico", {
    tipo: "proyeccion_por_tracto",
    claseEntidad: "conexion",
    tractoFasciculo: "Tracto mamilotalamico",
    funcion: "Axones mamilares ascienden hacia nucleos anteriores del talamo.",
    importanciaAprendizaje: "Mantiene continuidad del circuito diencefalico de memoria.",
    etiquetas: ["memoria", "circuito_papez"],
    referencias: ["aggleton_brown_1999", "papez_1937"]
  }),
  connection("tracto_mtt_talamo_anterior", "tracto_mamilotalamico", "nucleos_anteriores_talamo", "Terminacion mamilotalamica", {
    tipo: "proyeccion_por_tracto",
    claseEntidad: "conexion",
    tractoFasciculo: "Tracto mamilotalamico",
    funcion: "Termina principalmente en nucleos anteriores del talamo.",
    importanciaAprendizaje: "Su interrupcion puede desconectar componentes de la red mnemonica diencefalica.",
    etiquetas: ["memoria", "circuito_papez"],
    referencias: ["aggleton_brown_1999"]
  }),
  connection("talamo_anterior_giro_cingulado", "nucleos_anteriores_talamo", "giro_cingulado", "Proyeccion talamocingulada", {
    funcion: "Proyeccion de nucleos anteriores hacia cortezas cinguladas, con organizacion topografica.",
    importanciaAprendizaje: "Conecta componentes diencefalicos y corticales de redes de memoria.",
    etiquetas: ["memoria", "circuito_papez"],
    referencias: ["aggleton_brown_1999", "papez_1937"]
  }),
  connection("giro_cingulado_cingulo", "giro_cingulado", "cingulo", "Fibras cinguladas hacia cingulo", {
    tipo: "proyeccion_por_tracto",
    tractoFasciculo: "Cingulo",
    funcion: "Incorpora proyecciones cinguladas al haz del cingulo.",
    importanciaAprendizaje: "Da continuidad a interacciones cingulado-retrosplenial-parahipocampales.",
    etiquetas: ["memoria", "circuito_papez"],
    referencias: ["ranganath_ritchey_2012", "papez_1937"]
  }),
  connection("cingulo_entorrinal", "cingulo", "corteza_entorrinal", "Proyeccion cingulo-parahipocampal", {
    tipo: "proyeccion_por_tracto",
    tractoFasciculo: "Cingulo",
    funcion: "Representa la conexion predominante del haz hacia regiones parahipocampales/entorrinales en el esquema educativo.",
    importanciaAprendizaje: "Relaciona corteza cingulada con la interfaz entorrinal-hipocampal.",
    evidencia: "probable",
    etiquetas: ["memoria", "circuito_papez"],
    referencias: ["ranganath_ritchey_2012", "papez_1937"]
  }),
  connection("talamo_anterior_retrosplenial", "nucleos_anteriores_talamo", "corteza_retrosplenial", "Conexion talamo-retrosplenial", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Interaccion bidireccional predominante entre talamo anterior y corteza retrosplenial.",
    importanciaAprendizaje: "Participa en redes mnemonicas y de orientacion espacial.",
    etiquetas: ["memoria", "navegacion"],
    referencias: ["aggleton_brown_1999", "ranganath_ritchey_2012"]
  }),

  connection("sensorial_perirrinal", "cortezas_sensoriales_asociativas", "corteza_perirrinal", "Flujo asociativo hacia corteza perirrinal", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Intercambio jerarquico entre representaciones de objetos y corteza perirrinal.",
    importanciaAprendizaje: "Contribuye a memoria de items y reconocimiento dentro de redes distribuidas.",
    etiquetas: ["memoria_episodica", "reconocimiento"],
    referencias: ["van_strien_2009", "ranganath_ritchey_2012"]
  }),
  connection("sensorial_parahipocampal", "cortezas_sensoriales_asociativas", "corteza_parahipocampal", "Flujo asociativo contextual", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Intercambio entre cortezas de asociacion y representaciones contextuales parahipocampales.",
    importanciaAprendizaje: "Aporta informacion de escenas y contexto a redes del lobulo temporal medial.",
    etiquetas: ["memoria_episodica", "contexto"],
    referencias: ["ranganath_ritchey_2012", "van_strien_2009"]
  }),
  connection("perirrinal_entorrinal", "corteza_perirrinal", "corteza_entorrinal", "Conexion perirrinal-entorrinal", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Intercambio entre informacion de items y la interfaz entorrinal.",
    importanciaAprendizaje: "Participa en entrada y salida cortical del sistema hipocampal.",
    etiquetas: ["memoria_episodica", "memoria_semantica"],
    referencias: ["van_strien_2009"]
  }),
  connection("parahipocampal_entorrinal", "corteza_parahipocampal", "corteza_entorrinal", "Conexion parahipocampal-entorrinal", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Intercambio de informacion contextual y espacial con corteza entorrinal.",
    importanciaAprendizaje: "Canaliza contexto hacia formacion hipocampal y devuelve informacion procesada.",
    etiquetas: ["memoria_episodica", "contexto", "navegacion"],
    referencias: ["van_strien_2009", "ranganath_ritchey_2012"]
  }),
  connection("subiculo_retrosplenial", "subiculo", "corteza_retrosplenial", "Conexion subiculo-retrosplenial", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Interaccion entre salidas hipocampales y corteza retrosplenial.",
    importanciaAprendizaje: "Contribuye a contexto, navegacion y recuperacion episodica.",
    etiquetas: ["memoria_episodica", "navegacion"],
    referencias: ["ranganath_ritchey_2012", "moser_2008"]
  }),
  connection("retrosplenial_cingulada_posterior", "corteza_retrosplenial", "corteza_cingulada_posterior", "Continuidad retrosplenial-cingulada posterior", {
    direccion: "reciproca",
    tipo: "conectividad_funcional",
    claseEntidad: "relacion_funcional",
    polaridad: "no_aplica",
    neurotransmisorPrincipal: "no_aplica",
    funcion: "Interaccion entre regiones mediales posteriores contiguas y conectadas.",
    importanciaAprendizaje: "Integra contexto espacial y recuperacion autobiografica.",
    evidencia: "modelo_funcional",
    especies: ["humano"],
    tiposEvidencia: ["neuroimagen", "revision"],
    etiquetas: ["memoria_episodica", "contexto"],
    referencias: ["ranganath_ritchey_2012"]
  }),
  connection("cingulada_posterior_precuneo", "corteza_cingulada_posterior", "precuneo", "Conexion cingulada posterior-precuneo", {
    direccion: "reciproca",
    tipo: "conectividad_funcional",
    claseEntidad: "relacion_funcional",
    polaridad: "no_aplica",
    neurotransmisorPrincipal: "no_aplica",
    funcion: "Interaccion dentro de redes mediales posteriores.",
    importanciaAprendizaje: "Participa en construccion de escenas y recuperacion autobiografica.",
    evidencia: "modelo_funcional",
    especies: ["humano"],
    tiposEvidencia: ["neuroimagen", "revision"],
    etiquetas: ["memoria_episodica", "atencion_interna"],
    referencias: ["ranganath_ritchey_2012"]
  }),
  connection("precuneo_prefrontal_medial", "precuneo", "corteza_prefrontal_medial", "Conexion precuneo-prefrontal medial", {
    direccion: "reciproca",
    tipo: "conectividad_funcional",
    claseEntidad: "relacion_funcional",
    polaridad: "no_aplica",
    neurotransmisorPrincipal: "no_aplica",
    funcion: "Interaccion de redes corticales mediales anteriores y posteriores.",
    importanciaAprendizaje: "Apoya recuperacion dirigida y organizacion de recuerdos.",
    evidencia: "modelo_funcional",
    especies: ["humano"],
    tiposEvidencia: ["neuroimagen", "revision"],
    etiquetas: ["memoria_episodica", "ejecutivo"],
    referencias: ["ranganath_ritchey_2012"]
  }),
  connection("prefrontal_medial_retrosplenial", "corteza_prefrontal_medial", "corteza_retrosplenial", "Conexion prefrontal medial-retrosplenial", {
    direccion: "reciproca",
    tipo: "conectividad_funcional",
    claseEntidad: "relacion_funcional",
    polaridad: "no_aplica",
    neurotransmisorPrincipal: "no_aplica",
    funcion: "Interaccion entre control/valoracion prefrontal y representaciones contextuales posteriores.",
    importanciaAprendizaje: "Contribuye a recuperacion guiada por esquemas y contexto.",
    evidencia: "modelo_funcional",
    especies: ["humano", "roedor"],
    tiposEvidencia: ["neuroimagen", "trazado_anatomico", "revision"],
    etiquetas: ["memoria_episodica", "consolidacion"],
    referencias: ["ranganath_ritchey_2012"]
  }),
  connection("subiculo_prefrontal_medial", "subiculo", "corteza_prefrontal_medial", "Proyeccion hipocampo-prefrontal", {
    funcion: "Proyeccion predominante desde salidas hipocampales hacia regiones prefrontales mediales.",
    importanciaAprendizaje: "Vincula contexto y memoria con control y toma de decisiones.",
    evidencia: "probable",
    etiquetas: ["memoria_episodica", "ejecutivo"],
    referencias: ["ranganath_ritchey_2012"]
  }),

  connection("sensorial_multimodal", "cortezas_sensoriales_asociativas", "corteza_asociativa_multimodal", "Convergencia multimodal", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Integra rasgos distribuidos de multiples modalidades.",
    importanciaAprendizaje: "Proporciona contenido para aprendizaje conceptual y episodico.",
    evidencia: "modelo_funcional",
    etiquetas: ["memoria_semantica"],
    referencias: ["lambon_ralph_2017"]
  }),
  connection("multimodal_temporal_lateral", "corteza_asociativa_multimodal", "corteza_temporal_lateral", "Red semantica lateral", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Intercambio entre representaciones distribuidas y regiones temporales de asociacion.",
    importanciaAprendizaje: "Contribuye a acceso y control de conocimiento semantico.",
    evidencia: "modelo_funcional",
    etiquetas: ["memoria_semantica"],
    referencias: ["lambon_ralph_2017"]
  }),
  connection("temporal_lateral_anterior", "corteza_temporal_lateral", "corteza_temporal_anterior", "Conexion temporal lateral-anterior", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Interaccion a lo largo de gradientes temporales para integracion conceptual.",
    importanciaAprendizaje: "Apoya representaciones semanticas transmodales sin crear un almacen unico.",
    evidencia: "modelo_funcional",
    etiquetas: ["memoria_semantica"],
    referencias: ["lambon_ralph_2017"]
  }),
  connection("temporal_anterior_prefrontal", "corteza_temporal_anterior", "corteza_prefrontal", "Conexion temporal anterior-prefrontal", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Vincula representacion conceptual con seleccion y control semantico.",
    importanciaAprendizaje: "Permite usar conocimiento segun metas y contexto.",
    evidencia: "modelo_funcional",
    etiquetas: ["memoria_semantica", "ejecutivo"],
    referencias: ["lambon_ralph_2017"]
  }),
  connection("perirrinal_temporal_anterior", "corteza_perirrinal", "corteza_temporal_anterior", "Conexion perirrinal-temporal anterior", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Vincula representaciones de objetos complejos con redes conceptuales temporales.",
    importanciaAprendizaje: "Puede contribuir a adquirir conocimiento sobre entidades nuevas.",
    evidencia: "probable",
    etiquetas: ["memoria_semantica", "reconocimiento"],
    referencias: ["lambon_ralph_2017", "van_strien_2009"]
  }),

  connection("dlpfc_parietal", "corteza_prefrontal_dorsolateral", "corteza_parietal_posterior", "Conexion frontoparietal", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Interaccion recurrente entre regiones frontales y parietales segun contenido y demanda.",
    importanciaAprendizaje: "Sostiene mantenimiento, actualizacion y control de informacion en memoria de trabajo.",
    evidencia: "modelo_funcional",
    etiquetas: ["memoria_trabajo", "mantenimiento", "actualizacion", "ejecutivo"],
    referencias: ["desposito_postle_2015"]
  }),
  connection("dlpfc_mediodorsal", "corteza_prefrontal_dorsolateral", "nucleo_mediodorsal_talamo", "Bucle prefrontal-mediodorsal", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Representacion comparada de conectividad mediodorsal-prefrontal. La evidencia causal citada corresponde a MD con corteza prefrontal medial en raton, no a DLPFC humana.",
    importanciaAprendizaje: "El resultado en raton apoya mantenimiento de memoria de trabajo en MD-mPFC; trasladarlo a DLPFC de primates es una correspondencia de red, no una equivalencia causal demostrada.",
    evidencia: "modelo_funcional",
    especies: ["roedor"],
    tiposEvidencia: ["trazado_anatomico", "manipulacion_causal", "revision"],
    etiquetas: ["memoria_trabajo", "mantenimiento", "ejecutivo"],
    referencias: ["bolkan_2017", "desposito_postle_2015"]
  }),
  connection("parietal_talamo", "corteza_parietal_posterior", "talamo", "Conexion parietal-talamica", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Interaccion corticotalamica simplificada para redes atencionales y de trabajo.",
    importanciaAprendizaje: "Ayuda a coordinar representaciones distribuidas; se expandira por nucleos en fases futuras.",
    evidencia: "probable",
    etiquetas: ["memoria_trabajo", "atencion"],
    referencias: ["desposito_postle_2015", "kandel_2021"]
  }),
  connection("dlpfc_caudado", "corteza_prefrontal_dorsolateral", "caudado", "Proyeccion corticoestriatal asociativa", {
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Entrada glutamatergica prefrontal a territorios asociativos del caudado.",
    importanciaAprendizaje: "Contribuye a seleccion y actualizacion de reglas o acciones guiadas por metas.",
    etiquetas: ["memoria_trabajo", "ejecutivo", "aprendizaje_procedimental"],
    referencias: ["alexander_delong_strick_1986"]
  }),
  connection("caudado_gpi", "caudado", "globo_palido_interno", "Salida estriopalidal asociativa", {
    polaridad: "predominantemente_inhibitoria",
    neurotransmisorPrincipal: "GABA",
    funcion: "Proyeccion inhibitoria estriatal hacia nucleos palidales de salida.",
    importanciaAprendizaje: "Modifica el gating de bucles asociativos.",
    etiquetas: ["ejecutivo", "actualizacion"],
    referencias: ["alexander_delong_strick_1986"]
  }),
  connection("gpi_mediodorsal", "globo_palido_interno", "nucleo_mediodorsal_talamo", "Salida palidotalamica asociativa", {
    polaridad: "predominantemente_inhibitoria",
    neurotransmisorPrincipal: "GABA",
    funcion: "Salida inhibitoria de ganglios basales hacia talamo de asociacion.",
    importanciaAprendizaje: "Participa en seleccion/gating de bucles prefrontales.",
    etiquetas: ["ejecutivo", "memoria_trabajo"],
    referencias: ["alexander_delong_strick_1986"]
  }),

  connection("motora_putamen", "corteza_motora", "putamen", "Proyeccion corticoestriatal motora", {
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Entrada glutamatergica sensorimotora al putamen.",
    importanciaAprendizaje: "Aporta estado y planes motores a bucles de seleccion de acciones y habilidades.",
    etiquetas: ["motor", "aprendizaje_procedimental", "habitos"],
    referencias: ["alexander_delong_strick_1986", "yin_knowlton_2006"]
  }),
  connection("putamen_gpi", "putamen", "globo_palido_interno", "Via estriopalidal", {
    polaridad: "predominantemente_inhibitoria",
    neurotransmisorPrincipal: "GABA",
    funcion: "Proyeccion inhibitoria desde putamen a GPi dentro de la via directa simplificada.",
    importanciaAprendizaje: "Modula salida de ganglios basales durante seleccion de acciones.",
    etiquetas: ["motor", "aprendizaje_procedimental", "seleccion_acciones"],
    referencias: ["alexander_delong_strick_1986"]
  }),
  connection("putamen_snr", "putamen", "sustancia_negra_reticulata", "Via estrionigral", {
    polaridad: "predominantemente_inhibitoria",
    neurotransmisorPrincipal: "GABA",
    funcion: "Proyeccion inhibitoria estriatal hacia SNr, nucleo de salida.",
    importanciaAprendizaje: "Participa en seleccion de respuestas motoras y oculomotoras.",
    etiquetas: ["motor", "aprendizaje_procedimental"],
    referencias: ["alexander_delong_strick_1986"]
  }),
  connection("gpi_talamo_motor", "globo_palido_interno", "talamo", "Via palidotalamica motora", {
    polaridad: "predominantemente_inhibitoria",
    neurotransmisorPrincipal: "GABA",
    funcion: "Salida inhibitoria tonica hacia nucleos talamicos motores agregados.",
    importanciaAprendizaje: "Regula el retorno talamocortical dentro del bucle motor.",
    etiquetas: ["motor", "aprendizaje_procedimental", "seleccion_acciones"],
    referencias: ["alexander_delong_strick_1986"]
  }),
  connection("snr_talamo_motor", "sustancia_negra_reticulata", "talamo", "Salida nigrotalamica", {
    polaridad: "predominantemente_inhibitoria",
    neurotransmisorPrincipal: "GABA",
    funcion: "Salida inhibitoria desde SNr hacia dianas talamicas agregadas.",
    importanciaAprendizaje: "Contribuye al gating de acciones.",
    etiquetas: ["motor", "aprendizaje_procedimental"],
    referencias: ["alexander_delong_strick_1986"]
  }),
  connection("talamo_corteza_motora", "talamo", "corteza_motora", "Proyeccion talamocortical motora", {
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Retorno excitatorio talamico hacia cortezas motoras.",
    importanciaAprendizaje: "Cierra el bucle cortico-basal-ganglios-talamo-cortical simplificado.",
    etiquetas: ["motor", "aprendizaje_procedimental"],
    referencias: ["alexander_delong_strick_1986"]
  }),
  connection("snc_estriado_dopamina", "sustancia_negra_compacta", "estriado", "Proyeccion nigroestriatal dopaminergica", {
    tipo: "senal_moduladora",
    claseEntidad: "senal_moduladora",
    polaridad: "moduladora",
    neurotransmisorPrincipal: "dopamina",
    funcion: "Modula plasticidad y excitabilidad de poblaciones estriatales mediante receptores distintos.",
    importanciaAprendizaje: "Contribuye a aprendizaje por refuerzo y ajuste de acciones; el efecto no es uniformemente excitatorio o inhibitorio.",
    etiquetas: ["dopamina", "aprendizaje_procedimental", "aprendizaje_refuerzo", "modulacion"],
    referencias: ["yin_knowlton_2006", "kandel_2021"]
  }),

  connection("talamo_sensorial_bla", "talamo_sensorial", "amigdala_basolateral", "Ruta talamo-amigdalina", {
    funcion: "Entrada sensorial talamica hacia nucleos laterales/basolaterales, dependiente de modalidad.",
    importanciaAprendizaje: "Proporciona informacion sensorial rapida para asociaciones aversivas en modelos experimentales.",
    evidencia: "no_especificada",
    etiquetas: ["condicionamiento", "memoria_emocional"],
    referencias: ["ledoux_2000"]
  }),
  connection("talamo_sensorial_corteza", "talamo_sensorial", "cortezas_sensoriales_asociativas", "Ruta talamocortical sensorial", {
    funcion: "Relevo sensorial hacia corteza para procesamiento perceptivo elaborado.",
    importanciaAprendizaje: "Aporta representaciones detalladas a redes de condicionamiento y memoria.",
    etiquetas: ["sensorial", "condicionamiento"],
    referencias: ["ledoux_2000", "kandel_2021"]
  }),
  connection("corteza_sensorial_bla", "cortezas_sensoriales_asociativas", "amigdala_basolateral", "Ruta cortico-amigdalina", {
    funcion: "Entrada cortical sensorial elaborada al complejo basolateral.",
    importanciaAprendizaje: "Permite asociaciones con estimulos perceptivamente complejos.",
    etiquetas: ["condicionamiento", "memoria_emocional"],
    referencias: ["ledoux_2000", "phelps_ledoux_2005"]
  }),
  connection("bla_amigdala_central", "amigdala_basolateral", "amigdala_central", "Transmision basolateral-central", {
    funcion: "Interaccion intraamigdalina simplificada que enlaza aprendizaje asociativo con nucleos de salida.",
    importanciaAprendizaje: "Convierte asociaciones aprendidas en patrones de respuesta; existen microcircuitos interpuestos no dibujados.",
    evidencia: "modelo_funcional",
    etiquetas: ["condicionamiento", "memoria_emocional"],
    referencias: ["ledoux_2000"]
  }),
  connection("amigdala_central_hipotalamo", "amigdala_central", "hipotalamo", "Salida amigdalohipotalamica", {
    polaridad: "mixta",
    neurotransmisorPrincipal: "GABA y peptidos",
    funcion: "Proyecciones hacia circuitos autonomicos y endocrinos hipotalamicos.",
    importanciaAprendizaje: "Participa en expresion corporal de respuestas emocionales aprendidas.",
    etiquetas: ["condicionamiento", "respuesta_autonomica"],
    referencias: ["ledoux_2000"]
  }),
  connection("amigdala_central_pag", "amigdala_central", "sustancia_gris_periacueductal", "Salida amigdaloperiacueductal", {
    polaridad: "mixta",
    neurotransmisorPrincipal: "GABA y peptidos",
    funcion: "Influye en circuitos mesencefalicos de respuestas defensivas.",
    importanciaAprendizaje: "Relaciona asociaciones aversivas con componentes conductuales de respuesta.",
    etiquetas: ["condicionamiento", "respuesta_defensiva"],
    referencias: ["ledoux_2000"]
  }),
  connection("hipocampo_bla", "hipocampo", "amigdala_basolateral", "Conexion hipocampo-amigdala basolateral", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Intercambio reciproco y topografico entre la formacion hipocampal anterior/ventral y el complejo basolateral, representado aqui con nodos agregados.",
    importanciaAprendizaje: "En roedores contribuye a condicionamiento contextual y modulacion emocional; no se extrapola como una conexion uniforme de todo el hipocampo humano.",
    evidencia: "probable",
    especies: ["roedor"],
    tiposEvidencia: ["trazado_anatomico", "revision"],
    etiquetas: ["memoria_emocional", "contexto", "reconsolidacion"],
    referencias: ["pitkanen_2000", "phelps_ledoux_2005"]
  }),
  connection("vmpfc_bla", "corteza_prefrontal_ventromedial", "amigdala_basolateral", "Conexion vmPFC-amigdala", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    polaridad: "moduladora",
    funcion: "Interaccion prefrontal-amigdalina dentro de redes de valor, regulacion y extincion.",
    importanciaAprendizaje: "La extincion implica aprendizaje nuevo y control contextual, no borrado simple de la memoria original.",
    evidencia: "modelo_funcional",
    especies: ["roedor", "humano"],
    tiposEvidencia: ["manipulacion_causal", "neuroimagen", "revision_translacional"],
    etiquetas: ["memoria_emocional", "extincion", "regulacion"],
    referencias: ["milad_quirk_2012"]
  }),

  connection("vta_accumbens_dopamina", "vta", "nucleo_accumbens", "Proyeccion mesolimbica dopaminergica", {
    tipo: "senal_moduladora",
    claseEntidad: "senal_moduladora",
    polaridad: "moduladora",
    neurotransmisorPrincipal: "dopamina",
    funcion: "Modula estriado ventral segun poblacion, receptor, estado y contingencias.",
    importanciaAprendizaje: "Puede transportar componentes de error de prediccion y saliencia; no equivale a placer ni recompensa anatomica.",
    evidencia: "modelo_funcional",
    especies: ["roedor", "primate", "humano"],
    tiposEvidencia: ["trazado_anatomico", "electrofisiologia", "neuroimagen", "modelo_computacional"],
    etiquetas: ["dopamina", "recompensa", "aprendizaje_refuerzo", "modulacion"],
    referencias: ["schultz_dayan_montague_1997", "haber_knutson_2010"]
  }),
  connection("vta_prefrontal_dopamina", "vta", "corteza_prefrontal_medial", "Proyeccion mesocortical dopaminergica", {
    tipo: "senal_moduladora",
    claseEntidad: "senal_moduladora",
    polaridad: "moduladora",
    neurotransmisorPrincipal: "dopamina",
    funcion: "Modula redes prefrontales de valor, control y aprendizaje.",
    importanciaAprendizaje: "Ajusta plasticidad y procesamiento dependiente de contexto y receptor.",
    etiquetas: ["dopamina", "recompensa", "ejecutivo", "modulacion"],
    referencias: ["haber_knutson_2010", "yetnikoff_2014"]
  }),
  connection("vta_dlpfc_dopamina", "vta", "corteza_prefrontal_dorsolateral", "Modulacion dopaminergica dorsolateral", {
    tipo: "senal_moduladora",
    claseEntidad: "senal_moduladora",
    polaridad: "moduladora",
    neurotransmisorPrincipal: "dopamina",
    funcion: "Representa modulacion mesocortical de redes prefrontales de memoria de trabajo.",
    importanciaAprendizaje: "El efecto depende de receptor, concentracion, estado de red y demanda; no es lineal ni uniformemente facilitador.",
    evidencia: "modelo_funcional",
    etiquetas: ["dopamina", "memoria_trabajo", "ejecutivo", "modulacion"],
    referencias: ["desposito_postle_2015", "kandel_2021"]
  }),
  connection("vta_hipocampo_dopamina", "vta", "hipocampo", "Modulacion dopaminergica hipocampal", {
    tipo: "senal_moduladora",
    claseEntidad: "senal_moduladora",
    polaridad: "moduladora",
    neurotransmisorPrincipal: "dopamina",
    funcion: "Representa una contribucion dopaminergica VTA-hipocampo descrita principalmente en modelos animales dentro de una red catecolaminergica mas amplia.",
    importanciaAprendizaje: "Puede modular plasticidad y priorizacion de informacion; la contribucion relativa de VTA y locus coeruleus depende de region, tarea y metodo.",
    evidencia: "probable",
    especies: ["roedor"],
    tiposEvidencia: ["trazado_anatomico", "manipulacion_causal", "revision"],
    etiquetas: ["dopamina", "memoria", "plasticidad", "modulacion"],
    referencias: ["tsetsenis_2023"]
  }),
  connection("vta_amigdala_dopamina", "vta", "amigdala_basolateral", "Modulacion dopaminergica amigdalina", {
    tipo: "senal_moduladora",
    claseEntidad: "senal_moduladora",
    polaridad: "moduladora",
    neurotransmisorPrincipal: "dopamina",
    funcion: "Modula plasticidad y excitabilidad basolateral segun receptor y contexto.",
    importanciaAprendizaje: "Vincula relevancia motivacional y aprendizaje emocional.",
    evidencia: "probable",
    especies: ["roedor"],
    tiposEvidencia: ["trazado_anatomico", "electrofisiologia", "manipulacion_causal"],
    etiquetas: ["dopamina", "memoria_emocional", "recompensa", "modulacion"],
    referencias: ["tang_2020", "phelps_ledoux_2005"]
  }),
  connection("prefrontal_accumbens", "corteza_prefrontal_medial", "nucleo_accumbens", "Proyeccion prefrontal-accumbens", {
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Entrada glutamatergica cortical al estriado ventral.",
    importanciaAprendizaje: "Aporta metas y valoracion cortical a seleccion de acciones motivadas.",
    etiquetas: ["recompensa", "aprendizaje_refuerzo", "ejecutivo"],
    referencias: ["haber_knutson_2010"]
  }),
  connection("bla_accumbens", "amigdala_basolateral", "nucleo_accumbens", "Proyeccion amigdala-accumbens", {
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Entrada glutamatergica que aporta valor afectivo y asociaciones de claves.",
    importanciaAprendizaje: "Contribuye a que estimulos aprendidos influyan en acciones motivadas.",
    etiquetas: ["recompensa", "memoria_emocional"],
    referencias: ["haber_knutson_2010"]
  }),
  connection("subiculo_accumbens", "subiculo", "nucleo_accumbens", "Proyeccion hipocampal-accumbens", {
    polaridad: "predominantemente_excitatoria",
    neurotransmisorPrincipal: "glutamato",
    funcion: "Entrada glutamatergica desde subiculo, especialmente ventral, hacia estriado ventral.",
    importanciaAprendizaje: "Aporta contexto y memoria espacial a seleccion motivada.",
    etiquetas: ["recompensa", "contexto", "memoria"],
    referencias: ["haber_knutson_2010"]
  }),
  connection("accumbens_palido_ventral", "nucleo_accumbens", "palido_ventral", "Proyeccion accumbens-palido ventral", {
    polaridad: "predominantemente_inhibitoria",
    neurotransmisorPrincipal: "GABA",
    funcion: "Salida inhibitoria del estriado ventral hacia palido ventral.",
    importanciaAprendizaje: "Transforma integracion de valor/contexto en cambios de salida del circuito limbico de ganglios basales.",
    etiquetas: ["recompensa", "aprendizaje_refuerzo"],
    referencias: ["haber_knutson_2010"]
  }),
  connection("palido_ventral_mediodorsal", "palido_ventral", "nucleo_mediodorsal_talamo", "Salida palido ventral-talamica", {
    polaridad: "predominantemente_inhibitoria",
    neurotransmisorPrincipal: "GABA",
    funcion: "Salida palidal hacia talamo de asociacion dentro del bucle limbico simplificado.",
    importanciaAprendizaje: "Participa en el retorno de informacion de seleccion/valor hacia prefrontal.",
    etiquetas: ["recompensa", "aprendizaje_refuerzo"],
    referencias: ["haber_knutson_2010"]
  }),
  connection("mediodorsal_prefrontal_medial", "nucleo_mediodorsal_talamo", "corteza_prefrontal_medial", "Proyeccion mediodorsal-prefrontal", {
    funcion: "Proyeccion talamocortical hacia corteza prefrontal medial.",
    importanciaAprendizaje: "Cierra un bucle limbico simplificado de ganglios basales y corteza.",
    etiquetas: ["recompensa", "ejecutivo"],
    referencias: ["haber_knutson_2010", "alexander_delong_strick_1986"]
  }),

  connection("mec_giro_dentado", "corteza_entorrinal_medial", "giro_dentado", "Via perforante medial", {
    tipo: "via",
    claseEntidad: "via",
    tractoFasciculo: "Via perforante medial",
    funcion: "Entrada desde corteza entorrinal medial hacia giro dentado.",
    importanciaAprendizaje: "Integra codigos espaciales entorrinales con representaciones hipocampales.",
    plasticidad: { tipos: ["LTP", "LTD"], nota: "Plasticidad dependiente de actividad en la entrada entorrinal.", evidencia: "establecida" },
    etiquetas: ["navegacion", "memoria_espacial", "plasticidad"],
    referencias: ["moser_2008", "amaral_witter_1989"]
  }),
  connection("mec_ca1", "corteza_entorrinal_medial", "ca1", "Entrada entorrinal medial a CA1", {
    tipo: "via",
    claseEntidad: "via",
    tractoFasciculo: "Via temporoamonica medial",
    funcion: "Entrada entorrinal medial directa con preferencia por CA1 proximal, cerca de CA2, dentro de circuitos espaciales.",
    importanciaAprendizaje: "Converge con informacion intrahipocampal; la corteza entorrinal lateral muestra la preferencia complementaria por CA1 distal.",
    etiquetas: ["navegacion", "memoria_espacial"],
    referencias: ["moser_2008", "van_strien_2009", "brandon_koenig_leutgeb_2014"]
  }),
  connection("retrosplenial_mec", "corteza_retrosplenial", "corteza_entorrinal_medial", "Conexion retrosplenial-entorrinal medial", {
    direccion: "reciproca",
    tipo: "conexion_reciproca",
    funcion: "Interaccion entre marcos espaciales corticales y red entorrinal medial.",
    importanciaAprendizaje: "Contribuye a transformar claves ambientales y orientacion en representaciones espaciales.",
    evidencia: "probable",
    etiquetas: ["navegacion", "memoria_espacial"],
    referencias: ["moser_2008"]
  }),

  connection("septum_hipocampo_acetilcolina", "septum_medial", "hipocampo", "Proyeccion septohipocampal", {
    tipo: "senal_moduladora",
    claseEntidad: "senal_moduladora",
    polaridad: "moduladora",
    neurotransmisorPrincipal: "acetilcolina",
    funcion: "Modulacion colinergica, GABAergica y glutamatergica de redes hipocampales; la capa destaca acetilcolina.",
    importanciaAprendizaje: "Modula estado de red, codificacion y plasticidad sin actuar como una orden excitatoria simple.",
    etiquetas: ["acetilcolina", "memoria", "navegacion", "plasticidad", "modulacion"],
    referencias: ["hasselmo_2006", "kandel_2021"]
  }),
  connection("nbm_prefrontal_acetilcolina", "nucleo_basal_meynert", "corteza_prefrontal", "Proyeccion colinergica prefrontal", {
    tipo: "senal_moduladora",
    claseEntidad: "senal_moduladora",
    polaridad: "moduladora",
    neurotransmisorPrincipal: "acetilcolina",
    funcion: "Modulacion colinergica difusa de redes prefrontales.",
    importanciaAprendizaje: "Contribuye a atencion, senal-ruido y aprendizaje dependiente del estado.",
    etiquetas: ["acetilcolina", "atencion", "ejecutivo", "modulacion"],
    referencias: ["hasselmo_2006", "kandel_2021"]
  }),
  connection("nbm_sensorial_acetilcolina", "nucleo_basal_meynert", "cortezas_sensoriales_asociativas", "Proyeccion colinergica neocortical", {
    tipo: "senal_moduladora",
    claseEntidad: "senal_moduladora",
    polaridad: "moduladora",
    neurotransmisorPrincipal: "acetilcolina",
    funcion: "Modulacion colinergica amplia de cortezas de asociacion.",
    importanciaAprendizaje: "Puede favorecer procesamiento de senales relevantes y plasticidad cortical.",
    etiquetas: ["acetilcolina", "atencion", "aprendizaje", "modulacion"],
    referencias: ["hasselmo_2006", "kandel_2021"]
  })
]);

export const BRAIN_CONNECTION_BASE_BY_ID = new Map(BRAIN_CONNECTIONS_BASE.map((item) => [item.id, item]));
