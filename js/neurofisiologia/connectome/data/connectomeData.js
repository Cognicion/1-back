import { BRAIN_REFERENCES } from "./brainReferences.js";
import { BRAIN_REGIONS } from "./brainRegions.js";
import { BRAIN_CONNECTIONS_BASE } from "./brainConnections.js";
import { BRAIN_CIRCUITS } from "./brainCircuits.js";
import { BRAIN_TOURS } from "./brainTours.js";

export const CONNECTOME_DATA_VERSION = "1.0.0";

const circuitsByConnection = new Map();
BRAIN_CIRCUITS.forEach((circuit) => {
  circuit.conexiones.forEach((connectionId) => {
    if (!circuitsByConnection.has(connectionId)) circuitsByConnection.set(connectionId, []);
    circuitsByConnection.get(connectionId).push(circuit.id);
  });
});
/**
 * `circuitos` es una vista derivada. La pertenencia canonica vive solamente en
 * BRAIN_CIRCUITS, de modo que no puede divergir de los subgrafos declarados.
 */
export const BRAIN_CONNECTIONS = Object.freeze(BRAIN_CONNECTIONS_BASE.map((connection) => Object.freeze({
  ...connection,
  circuitos: Object.freeze([...(circuitsByConnection.get(connection.id) || [])])
})));

function derivedLayer(id, nombre, neurotransmisor, descripcion) {
  return Object.freeze({
    id,
    nombre,
    neurotransmisor,
    descripcion,
    nodos: Object.freeze(BRAIN_REGIONS
      .filter((node) => node.sistemas.includes(neurotransmisor) || node.neurotransmisoresRelevantes.includes(neurotransmisor))
      .map((node) => node.id)),
    conexiones: Object.freeze(BRAIN_CONNECTIONS
      .filter((edge) => edge.neurotransmisorPrincipal.toLowerCase().includes(neurotransmisor))
      .map((edge) => edge.id))
  });
}

export const MODULATORY_LAYERS = Object.freeze([
  derivedLayer("dopamina", "Sistema dopaminergico", "dopamina", "Muestra proyecciones moduladoras principales registradas desde VTA y sustancia negra compacta."),
  derivedLayer("acetilcolina", "Sistema colinergico", "acetilcolina", "Muestra proyecciones principales registradas desde septum medial y nucleo basal de Meynert.")
]);

export const MEMORY_MAP_GROUPS = Object.freeze([
  Object.freeze({ id: "memoria_episodica", nombre: "Memoria episodica", circuitos: Object.freeze(["episodic_memory", "hipocampal_trisynaptic", "papez"]) }),
  Object.freeze({ id: "memoria_semantica", nombre: "Memoria semantica", circuitos: Object.freeze(["semantic_memory"]) }),
  Object.freeze({ id: "memoria_trabajo", nombre: "Memoria de trabajo", circuitos: Object.freeze(["working_memory"]) }),
  Object.freeze({ id: "memoria_procedimental", nombre: "Memoria procedimental", circuitos: Object.freeze(["procedural_learning"]) }),
  Object.freeze({ id: "memoria_emocional", nombre: "Memoria emocional", circuitos: Object.freeze(["emotional_memory"]) }),
  Object.freeze({ id: "memoria_espacial", nombre: "Memoria espacial", circuitos: Object.freeze(["spatial_navigation"]) })
]);

export const CONNECTOME_DATA = Object.freeze({
  version: CONNECTOME_DATA_VERSION,
  regiones: BRAIN_REGIONS,
  conexiones: BRAIN_CONNECTIONS,
  circuitos: BRAIN_CIRCUITS,
  referencias: BRAIN_REFERENCES,
  recorridos: BRAIN_TOURS,
  capasModuladoras: MODULATORY_LAYERS,
  gruposMemoria: MEMORY_MAP_GROUPS,
  extensionPoints: Object.freeze({
    farmacologia: Object.freeze({ receptorField: "receptoresRelevantes", overlayApi: "applyReceptorOverlay" }),
    sofia: Object.freeze({ queryBridge: "ConnectomeQuestionBridge", status: "preparado_sin_api_remota" }),
    fisiologia: Object.freeze({ targetField: "fisiologiaTargets", event: "neuro-connectome:open-physiology" })
  })
});
