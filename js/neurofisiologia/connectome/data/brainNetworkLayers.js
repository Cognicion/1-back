function defineFunctionalNetwork(definition) {
  return Object.freeze({
    tipo: "red_funcional",
    evidencia: "modelo_funcional",
    ...definition,
    nodos: Object.freeze([...(definition.nodos || [])]),
    conexiones: Object.freeze([...(definition.conexiones || [])]),
    referencias: Object.freeze([...(definition.referencias || [])]),
    cautelas: Object.freeze([...(definition.cautelas || [])])
  });
}

/**
 * Overlays de conectividad funcional. Reutilizan IDs anatomicos y de relaciones
 * funcionales, pero no ingresan al registro de circuitos ni inventan tractos.
 */
export const FUNCTIONAL_NETWORK_LAYERS = Object.freeze([
  defineFunctionalNetwork({
    id: "default_mode_network",
    nombre: "Default Mode Network",
    descripcion: "Overlay de regiones mediales y parietales asociadas con cognicion interna, memoria autobiografica y procesamiento semantico.",
    nodos: [
      "corteza_cingulada_posterior", "precuneo", "corteza_prefrontal_medial", "corteza_retrosplenial",
      "giro_angular", "corteza_temporal_anterior", "hipocampo"
    ],
    conexiones: [
      "retrosplenial_cingulada_posterior", "cingulada_posterior_precuneo", "precuneo_prefrontal_medial",
      "prefrontal_medial_retrosplenial", "angular_precuneo_funcional"
    ],
    cautelas: [
      "La membresia depende del atlas, el metodo y el estado.",
      "Una relacion funcional no demuestra una proyeccion anatomica directa."
    ],
    referencias: ["menon_2023", "ranganath_ritchey_2012"]
  }),
  defineFunctionalNetwork({
    id: "central_executive_network",
    nombre: "Central Executive Network",
    descripcion: "Overlay frontoparietal bilateral simplificado para mantenimiento, manipulacion y control de informacion.",
    nodos: [
      "corteza_prefrontal_dorsolateral", "corteza_prefrontal_ventrolateral",
      "corteza_parietal_posterior", "giro_angular", "nucleo_mediodorsal_talamo"
    ],
    conexiones: ["dlpfc_parietal", "vlpfc_parietal_funcional"],
    cautelas: [
      "Central executive y frontoparietal no son sinonimos perfectos en todos los esquemas.",
      "El overlay representa conectividad funcional, no polaridad ni neurotransmisor."
    ],
    referencias: ["seeley_2007", "menon_2011", "desposito_postle_2015"]
  }),
  defineFunctionalNetwork({
    id: "salience_network",
    nombre: "Salience Network",
    descripcion: "Overlay funcional centrado en insula anterior y corteza cingulada anterior, con participacion cingulada media y amigdalina dependiente de tarea.",
    nodos: ["insula_anterior", "corteza_cingulada_anterior", "corteza_cingulada_media", "amigdala"],
    conexiones: ["insula_anterior_cingulada_anterior_funcional"],
    cautelas: [
      "Saliencia es una propiedad funcional distribuida, no una funcion exclusiva de un nodo.",
      "La red no debe convertirse en una ruta anatomica del pathfinder."
    ],
    referencias: ["seeley_2007", "menon_2011"]
  }),
  defineFunctionalNetwork({
    id: "frontoparietal_network",
    nombre: "Frontoparietal Network",
    descripcion: "Overlay funcional flexible de regiones prefrontales y parietales implicadas en control adaptativo y coordinacion entre sistemas.",
    nodos: [
      "corteza_prefrontal_dorsolateral", "corteza_prefrontal_ventrolateral", "corteza_parietal_posterior",
      "giro_angular", "giro_supramarginal", "precuneo"
    ],
    conexiones: ["dlpfc_parietal", "vlpfc_parietal_funcional", "angular_precuneo_funcional"],
    cautelas: [
      "Sus limites y nombre varian entre parcellaciones funcionales.",
      "La superposicion con redes ejecutiva y de modo predeterminado es deliberada y no duplica nodos."
    ],
    referencias: ["seeley_2007", "menon_2011", "menon_2023"]
  })
]);

export const FUNCTIONAL_NETWORK_LAYER_BY_ID = new Map(FUNCTIONAL_NETWORK_LAYERS.map((network) => [network.id, network]));
