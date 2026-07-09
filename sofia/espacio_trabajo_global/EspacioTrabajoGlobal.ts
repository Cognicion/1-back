import { BaseModuloCognitivo } from "../shared/ModuloCognitivo";
import type { EntradaCognitiva, ResultadoProceso } from "../shared/TiposCognitivos";

export interface EntradaEspacioTrabajoGlobal {
  datos: unknown;
  contextoPrevio?: unknown;
}

export interface SalidaEspacioTrabajoGlobal {
  tipo: "contexto_global";
  datos: unknown;
  resumen?: string;
}

/**
 * Modulo: Espacio de Trabajo Global
 *
 * Entradas:
 * - foco_atencional
 *
 * Salidas:
 * - contexto_global
 *
 * Dependencias:
 * - ContratoModuloCognitivo
 * - Bus de eventos opcional mediante inyeccion futura
 *
 * Eventos previstos:
 * - espacio_trabajo_global.entrada_recibida
 * - espacio_trabajo_global.procesamiento_completado
 * - espacio_trabajo_global.error
 *
 * Responsabilidades:
 * - Mantener el contexto activo compartido entre modulos cognitivos.
 *
 * Nota:
 * - Esta clase es un esqueleto. No contiene IA, Firebase ni logica clinica.
 */
export class EspacioTrabajoGlobal extends BaseModuloCognitivo<EntradaEspacioTrabajoGlobal, SalidaEspacioTrabajoGlobal> {
  constructor() {
    super("espacio_trabajo_global", "Espacio de Trabajo Global");
  }

  entradas(): string[] {
    return ["foco_atencional"];
  }

  async procesar(entrada: EntradaCognitiva<EntradaEspacioTrabajoGlobal>): Promise<ResultadoProceso<SalidaEspacioTrabajoGlobal>> {
    this.estado = "procesando";
    const salida: SalidaEspacioTrabajoGlobal = {
      tipo: "contexto_global",
      datos: entrada.contenido?.datos ?? entrada.contenido,
      resumen: "Mantener el contexto activo compartido entre modulos cognitivos."
    };
    this.estado = "listo";
    return this.crearSalida(salida, { entradaTipo: entrada.tipo });
  }
}
