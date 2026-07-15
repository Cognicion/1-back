export const ESTADOS_DICTADO = Object.freeze({
  IDLE: "idle",
  REQUESTING_PERMISSION: "requesting_permission",
  READY: "ready",
  LISTENING: "listening",
  PAUSED: "paused",
  RECONNECTING: "reconnecting",
  STOPPING: "stopping",
  PROCESSING: "processing",
  COMPLETED: "completed",
  RECOVERABLE_ERROR: "recoverable_error",
  FATAL_ERROR: "fatal_error"
});

const TRANSICIONES = {
  [ESTADOS_DICTADO.IDLE]: [
    ESTADOS_DICTADO.REQUESTING_PERMISSION,
    ESTADOS_DICTADO.READY,
    ESTADOS_DICTADO.FATAL_ERROR
  ],
  [ESTADOS_DICTADO.REQUESTING_PERMISSION]: [
    ESTADOS_DICTADO.READY,
    ESTADOS_DICTADO.LISTENING,
    ESTADOS_DICTADO.RECOVERABLE_ERROR,
    ESTADOS_DICTADO.FATAL_ERROR,
    ESTADOS_DICTADO.IDLE
  ],
  [ESTADOS_DICTADO.READY]: [
    ESTADOS_DICTADO.REQUESTING_PERMISSION,
    ESTADOS_DICTADO.LISTENING,
    ESTADOS_DICTADO.IDLE,
    ESTADOS_DICTADO.FATAL_ERROR
  ],
  [ESTADOS_DICTADO.LISTENING]: [
    ESTADOS_DICTADO.PAUSED,
    ESTADOS_DICTADO.RECONNECTING,
    ESTADOS_DICTADO.STOPPING,
    ESTADOS_DICTADO.PROCESSING,
    ESTADOS_DICTADO.RECOVERABLE_ERROR,
    ESTADOS_DICTADO.FATAL_ERROR
  ],
  [ESTADOS_DICTADO.PAUSED]: [
    ESTADOS_DICTADO.REQUESTING_PERMISSION,
    ESTADOS_DICTADO.LISTENING,
    ESTADOS_DICTADO.STOPPING,
    ESTADOS_DICTADO.COMPLETED,
    ESTADOS_DICTADO.IDLE,
    ESTADOS_DICTADO.FATAL_ERROR
  ],
  [ESTADOS_DICTADO.RECONNECTING]: [
    ESTADOS_DICTADO.LISTENING,
    ESTADOS_DICTADO.PAUSED,
    ESTADOS_DICTADO.RECOVERABLE_ERROR,
    ESTADOS_DICTADO.FATAL_ERROR
  ],
  [ESTADOS_DICTADO.STOPPING]: [
    ESTADOS_DICTADO.PROCESSING,
    ESTADOS_DICTADO.COMPLETED,
    ESTADOS_DICTADO.IDLE,
    ESTADOS_DICTADO.FATAL_ERROR
  ],
  [ESTADOS_DICTADO.PROCESSING]: [
    ESTADOS_DICTADO.COMPLETED,
    ESTADOS_DICTADO.RECOVERABLE_ERROR,
    ESTADOS_DICTADO.FATAL_ERROR
  ],
  [ESTADOS_DICTADO.COMPLETED]: [
    ESTADOS_DICTADO.READY,
    ESTADOS_DICTADO.REQUESTING_PERMISSION,
    ESTADOS_DICTADO.LISTENING,
    ESTADOS_DICTADO.IDLE
  ],
  [ESTADOS_DICTADO.RECOVERABLE_ERROR]: [
    ESTADOS_DICTADO.REQUESTING_PERMISSION,
    ESTADOS_DICTADO.RECONNECTING,
    ESTADOS_DICTADO.PAUSED,
    ESTADOS_DICTADO.IDLE,
    ESTADOS_DICTADO.FATAL_ERROR
  ],
  [ESTADOS_DICTADO.FATAL_ERROR]: [
    ESTADOS_DICTADO.IDLE,
    ESTADOS_DICTADO.REQUESTING_PERMISSION
  ]
};

export const ETIQUETAS_ESTADO_DICTADO = Object.freeze({
  [ESTADOS_DICTADO.IDLE]: "Dictado detenido",
  [ESTADOS_DICTADO.REQUESTING_PERMISSION]: "Solicitando micrófono...",
  [ESTADOS_DICTADO.READY]: "Dictado listo",
  [ESTADOS_DICTADO.LISTENING]: "Escuchando...",
  [ESTADOS_DICTADO.PAUSED]: "Dictado pausado",
  [ESTADOS_DICTADO.RECONNECTING]: "Reconectando dictado...",
  [ESTADOS_DICTADO.STOPPING]: "Deteniendo dictado...",
  [ESTADOS_DICTADO.PROCESSING]: "Procesando segmentos...",
  [ESTADOS_DICTADO.COMPLETED]: "Dictado finalizado",
  [ESTADOS_DICTADO.RECOVERABLE_ERROR]: "Error recuperable",
  [ESTADOS_DICTADO.FATAL_ERROR]: "Dictado no disponible"
});

export class DictadoStateMachine {
  constructor(estadoInicial = ESTADOS_DICTADO.IDLE) {
    this.estado = estadoInicial;
    this.contexto = {};
    this.suscriptores = new Set();
  }

  get current() {
    return this.estado;
  }

  can(nuevoEstado) {
    return this.estado === nuevoEstado || TRANSICIONES[this.estado]?.includes(nuevoEstado);
  }

  transition(nuevoEstado, contexto = {}) {
    if (!this.can(nuevoEstado)) {
      console.warn(`Transición de dictado no permitida: ${this.estado} -> ${nuevoEstado}`);
      return false;
    }

    const previo = this.estado;
    this.estado = nuevoEstado;
    this.contexto = { ...this.contexto, ...contexto, actualizadoEn: new Date().toISOString() };
    this.suscriptores.forEach((fn) => fn({
      previous: previo,
      current: this.estado,
      context: this.contexto
    }));
    return true;
  }

  subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    this.suscriptores.add(fn);
    fn({ previous: null, current: this.estado, context: this.contexto });
    return () => this.suscriptores.delete(fn);
  }

  reset() {
    this.transition(ESTADOS_DICTADO.IDLE, {});
  }
}
