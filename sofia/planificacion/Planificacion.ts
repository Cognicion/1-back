import { BaseModuloCognitivo } from "../shared/ModuloCognitivo";
import type { EntradaCognitiva, ResultadoProceso } from "../shared/TiposCognitivos";

export interface EntradaPlanificacion {
  datos: unknown;
  contextoPrevio?: unknown;
}

export interface SalidaPlanificacion {
  tipo: "plan_cognitivo";
  datos: unknown;
  resumen?: string;
}

/**
 * Modulo: Planificacion
 *
 * Entradas:
 * - hipotesis_razonadas
 *
 * Salidas:
 * - plan_cognitivo
 *
 * Dependencias:
 * - ContratoModuloCognitivo
 * - Bus de eventos opcional mediante inyeccion futura
 *
 * Eventos previstos:
 * - planificacion.entrada_recibida
 * - planificacion.procesamiento_completado
 * - planificacion.error
 *
 * Responsabilidades:
 * - Construir planes, pasos y rutas de accion a partir de objetivos.
 *
 * Nota:
 * - Esta clase es un esqueleto. No contiene IA, Firebase ni logica clinica.
 */
export class Planificacion extends BaseModuloCognitivo<EntradaPlanificacion, SalidaPlanificacion> {
  constructor() {
    super("planificacion", "Planificacion");
  }

  entradas(): string[] {
    return ["hipotesis_razonadas"];
  }

  async procesar(entrada: EntradaCognitiva<EntradaPlanificacion>): Promise<ResultadoProceso<SalidaPlanificacion>> {
    this.estado = "procesando";
    const salida: SalidaPlanificacion = {
      tipo: "plan_cognitivo",
      datos: entrada.contenido?.datos ?? entrada.contenido,
      resumen: "Construir planes, pasos y rutas de accion a partir de objetivos."
    };
    this.estado = "listo";
    return this.crearSalida(salida, { entradaTipo: entrada.tipo });
  }
}
