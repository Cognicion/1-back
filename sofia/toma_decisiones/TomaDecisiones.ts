import { BaseModuloCognitivo } from "../shared/ModuloCognitivo";
import type { EntradaCognitiva, ResultadoProceso } from "../shared/TiposCognitivos";

export interface EntradaTomaDecisiones {
  datos: unknown;
  contextoPrevio?: unknown;
}

export interface SalidaTomaDecisiones {
  tipo: "decision_candidata";
  datos: unknown;
  resumen?: string;
}

/**
 * Modulo: Toma de Decisiones
 *
 * Entradas:
 * - plan_cognitivo
 *
 * Salidas:
 * - decision_candidata
 *
 * Dependencias:
 * - ContratoModuloCognitivo
 * - Bus de eventos opcional mediante inyeccion futura
 *
 * Eventos previstos:
 * - toma_decisiones.entrada_recibida
 * - toma_decisiones.procesamiento_completado
 * - toma_decisiones.error
 *
 * Responsabilidades:
 * - Elegir acciones candidatas considerando incertidumbre, riesgo y utilidad.
 *
 * Nota:
 * - Esta clase es un esqueleto. No contiene IA, Firebase ni logica clinica.
 */
export class TomaDecisiones extends BaseModuloCognitivo<EntradaTomaDecisiones, SalidaTomaDecisiones> {
  constructor() {
    super("toma_decisiones", "Toma de Decisiones");
  }

  entradas(): string[] {
    return ["plan_cognitivo"];
  }

  async procesar(entrada: EntradaCognitiva<EntradaTomaDecisiones>): Promise<ResultadoProceso<SalidaTomaDecisiones>> {
    this.estado = "procesando";
    const salida: SalidaTomaDecisiones = {
      tipo: "decision_candidata",
      datos: entrada.contenido?.datos ?? entrada.contenido,
      resumen: "Elegir acciones candidatas considerando incertidumbre, riesgo y utilidad."
    };
    this.estado = "listo";
    return this.crearSalida(salida, { entradaTipo: entrada.tipo });
  }
}
