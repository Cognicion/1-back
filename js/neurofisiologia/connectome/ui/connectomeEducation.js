export const EDUCATION_LEVELS = Object.freeze([
  Object.freeze({ id: "basico", nombre: "Basico", descripcion: "Ideas esenciales en lenguaje sencillo." }),
  Object.freeze({ id: "intermedio", nombre: "Intermedio", descripcion: "Neuroanatomia, vias y funciones principales." }),
  Object.freeze({ id: "avanzado", nombre: "Avanzado", descripcion: "Evidencia, neurotransmisores, receptores, cautelas y referencias." })
]);

export const EVIDENCE_LABELS = Object.freeze({
  establecida: "Relacion anatomica establecida",
  probable: "Relacion probable o dependiente del modelo/especie",
  modelo_funcional: "Modelo funcional",
  controvertida: "Interpretacion controvertida",
  historica: "Modelo historico",
  no_especificada: "Evidencia no especificada en este registro"
});

export const PLASTICITY_EDUCATION = Object.freeze({
  hebb: "Cuando dos neuronas participan repetidamente de forma coordinada, determinadas sinapsis pueden fortalecerse. Es una regla educativa util, pero no explica por si sola toda la plasticidad cerebral.",
  ltp: "La LTP describe aumentos duraderos de eficacia sinaptica tras ciertos patrones de actividad. Sus mecanismos varian entre sinapsis.",
  ltd: "La LTD describe reducciones duraderas de eficacia sinaptica; complementa, pero no es el simple reverso universal de la LTP.",
  ca1: "En muchas sinapsis CA3-CA1, activacion NMDA y entrada de Ca2+ contribuyen a cambios en receptores AMPA. No toda plasticidad usa esta misma secuencia.",
  descargo: "Modelo celular educativo; no representa una medicion individual ni una intervencion clinica."
});

export function evidenceLabel(value) {
  return EVIDENCE_LABELS[value] || String(value || "Evidencia no clasificada").replaceAll("_", " ");
}

export function descriptionForLevel(entity, level = "basico") {
  const description = entity?.descripcion;
  if (description && typeof description === "object") {
    return description[level] || description.intermedio || description.basico || description.avanzado || "";
  }
  if (typeof description === "string") return description;
  if (entity?.funcion) return entity.funcion;
  return "";
}

export function educationalSummary(entity, level = "basico") {
  if (!entity) return "Selecciona una estructura, conexion o circuito para explorarla.";
  const base = descriptionForLevel(entity, level);
  if (level === "basico") return base;
  const extras = [];
  if (entity.funcion && entity.funcion !== base) extras.push(entity.funcion);
  if (level === "avanzado" && entity.evidencia) extras.push(`Evidencia: ${evidenceLabel(entity.evidencia)}.`);
  if (level === "avanzado" && entity.especies?.length) extras.push(`Base comparada: ${entity.especies.join(", ")}.`);
  return [base, ...extras].filter(Boolean).join(" ");
}

export function circuitTextAlternative(circuit, graph) {
  if (!circuit) return "";
  if (circuit.alternativaTextual) return circuit.alternativaTextual;
  return (circuit.secuencia || [])
    .map((id) => graph?.getNode?.(id)?.nombre || id)
    .join(" → ");
}

export class GuidedTourPlayer {
  constructor({ tours = [], onStep = () => {}, onState = () => {}, reducedMotion = false } = {}) {
    this.tours = new Map(tours.map((item) => [item.id, item]));
    this.onStep = onStep;
    this.onState = onState;
    this.reducedMotion = Boolean(reducedMotion);
    this.tour = null;
    this.index = -1;
    this.playing = false;
    this.timer = null;
  }

  start(tourId, { autoplay = false } = {}) {
    const tour = this.tours.get(tourId);
    if (!tour) throw new Error(`Recorrido inexistente: ${tourId}`);
    this.pause();
    this.tour = tour;
    this.index = 0;
    this.emitStep();
    if (autoplay && !this.reducedMotion) this.play();
    return this.snapshot();
  }

  register(tour) {
    if (!tour?.id || !Array.isArray(tour.pasos)) throw new Error("Recorrido invalido");
    this.tours.set(tour.id, tour);
    return tour;
  }

  unregister(tourId) {
    if (this.tour?.id === tourId) this.stop();
    return this.tours.delete(tourId);
  }

  next() {
    if (!this.tour) return null;
    if (this.index >= this.tour.pasos.length - 1) {
      this.pause();
      this.onState({ ...this.snapshot(), complete: true });
      return this.snapshot();
    }
    this.index += 1;
    this.emitStep();
    return this.snapshot();
  }

  previous() {
    if (!this.tour) return null;
    this.index = Math.max(0, this.index - 1);
    this.emitStep();
    return this.snapshot();
  }

  play() {
    if (!this.tour || this.reducedMotion) return this.snapshot();
    this.playing = true;
    this.schedule();
    this.onState(this.snapshot());
    return this.snapshot();
  }

  pause() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.onState(this.snapshot());
    return this.snapshot();
  }

  stop() {
    this.pause();
    this.tour = null;
    this.index = -1;
    this.onState(this.snapshot());
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
    if (this.reducedMotion) this.pause();
  }

  schedule() {
    if (!this.playing || !this.tour) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const before = this.index;
      this.next();
      if (this.playing && this.index !== before) this.schedule();
    }, Math.max(1200, Number(this.tour.velocidadMs) || 3600));
  }

  emitStep() {
    const step = this.tour?.pasos?.[this.index] || null;
    this.onStep(step, this.snapshot());
    this.onState(this.snapshot());
  }

  snapshot() {
    return {
      tourId: this.tour?.id || null,
      tour: this.tour,
      step: this.tour?.pasos?.[this.index] || null,
      index: this.index,
      total: this.tour?.pasos?.length || 0,
      playing: this.playing,
      reducedMotion: this.reducedMotion
    };
  }

  destroy() {
    this.pause();
    this.tours.clear();
    this.tour = null;
  }
}
