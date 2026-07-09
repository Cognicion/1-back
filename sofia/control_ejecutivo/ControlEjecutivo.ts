import { BaseModuloCognitivo } from "../shared/ModuloCognitivo";
import type { EntradaCognitiva, ResultadoProceso } from "../shared/TiposCognitivos";

export interface EntradaControlEjecutivo {
  datos: unknown;
  contextoPrevio?: unknown;
}

export interface SalidaControlEjecutivo {
  tipo: "directiva_ejecutiva";
  datos: unknown;
  resumen?: string;
}

/**
 * Modulo: Control Ejecutivo
 *
 * Entradas:
 * - contexto_global
 *
 * Salidas:
 * - directiva_ejecutiva
 *
 * Dependencias:
 * - ContratoModuloCognitivo
 * - Bus de eventos opcional mediante inyeccion futura
 *
 * Eventos previstos:
 * - control_ejecutivo.entrada_recibida
 * - control_ejecutivo.procesamiento_completado
 * - control_ejecutivo.error
 *
 * Responsabilidades:
 * - Supervisar metas, restricciones, prioridades y seguridad del flujo.
 *
 * Nota:
 * - Esta clase es un esqueleto. No contiene IA, Firebase ni logica clinica.
 */
export class ControlEjecutivo extends BaseModuloCognitivo<EntradaControlEjecutivo, SalidaControlEjecutivo> {
  constructor() {
    super("control_ejecutivo", "Control Ejecutivo");
  }

  entradas(): string[] {
    return ["contexto_global"];
  }

  async procesar(entrada: EntradaCognitiva<EntradaControlEjecutivo>): Promise<ResultadoProceso<SalidaControlEjecutivo>> {
    this.estado = "procesando";
    const salida: SalidaControlEjecutivo = {
      tipo: "directiva_ejecutiva",
      datos: entrada.contenido?.datos ?? entrada.contenido,
      resumen: "Supervisar metas, restricciones, prioridades y seguridad del flujo."
    };
    this.estado = "listo";
    return this.crearSalida(salida, { entradaTipo: entrada.tipo });
  }
}
