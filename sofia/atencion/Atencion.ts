import { BaseModuloCognitivo } from "../shared/ModuloCognitivo";
import type { EntradaCognitiva, ResultadoProceso } from "../shared/TiposCognitivos";

export interface EntradaAtencion {
  datos: unknown;
  contextoPrevio?: unknown;
}

export interface SalidaAtencion {
  tipo: "foco_atencional";
  datos: unknown;
  resumen?: string;
}

/**
 * Modulo: Atencion
 *
 * Entradas:
 * - senal_perceptiva
 *
 * Salidas:
 * - foco_atencional
 *
 * Dependencias:
 * - ContratoModuloCognitivo
 * - Bus de eventos opcional mediante inyeccion futura
 *
 * Eventos previstos:
 * - atencion.entrada_recibida
 * - atencion.procesamiento_completado
 * - atencion.error
 *
 * Responsabilidades:
 * - Priorizar informacion relevante y filtrar ruido antes del espacio global.
 *
 * Nota:
 * - Esta clase es un esqueleto. No contiene IA, Firebase ni logica clinica.
 */
export class Atencion extends BaseModuloCognitivo<EntradaAtencion, SalidaAtencion> {
  constructor() {
    super("atencion", "Atencion");
  }

  entradas(): string[] {
    return ["senal_perceptiva"];
  }

  async procesar(entrada: EntradaCognitiva<EntradaAtencion>): Promise<ResultadoProceso<SalidaAtencion>> {
    this.estado = "procesando";
    const salida: SalidaAtencion = {
      tipo: "foco_atencional",
      datos: entrada.contenido?.datos ?? entrada.contenido,
      resumen: "Priorizar informacion relevante y filtrar ruido antes del espacio global."
    };
    this.estado = "listo";
    return this.crearSalida(salida, { entradaTipo: entrada.tipo });
  }
}
