import { BaseModuloCognitivo } from "../shared/ModuloCognitivo";
import type { EntradaCognitiva, ResultadoProceso } from "../shared/TiposCognitivos";

export interface EntradaObjetivos {
  datos: unknown;
  contextoPrevio?: unknown;
}

export interface SalidaObjetivos {
  tipo: "objetivos_activos";
  datos: unknown;
  resumen?: string;
}

/**
 * Modulo: Objetivos
 *
 * Entradas:
 * - directiva_ejecutiva
 *
 * Salidas:
 * - objetivos_activos
 *
 * Dependencias:
 * - ContratoModuloCognitivo
 * - Bus de eventos opcional mediante inyeccion futura
 *
 * Eventos previstos:
 * - objetivos.entrada_recibida
 * - objetivos.procesamiento_completado
 * - objetivos.error
 *
 * Responsabilidades:
 * - Representar, actualizar y jerarquizar objetivos de trabajo.
 *
 * Nota:
 * - Esta clase es un esqueleto. No contiene IA, Firebase ni logica clinica.
 */
export class Objetivos extends BaseModuloCognitivo<EntradaObjetivos, SalidaObjetivos> {
  constructor() {
    super("objetivos", "Objetivos");
  }

  entradas(): string[] {
    return ["directiva_ejecutiva"];
  }

  async procesar(entrada: EntradaCognitiva<EntradaObjetivos>): Promise<ResultadoProceso<SalidaObjetivos>> {
    this.estado = "procesando";
    const salida: SalidaObjetivos = {
      tipo: "objetivos_activos",
      datos: entrada.contenido?.datos ?? entrada.contenido,
      resumen: "Representar, actualizar y jerarquizar objetivos de trabajo."
    };
    this.estado = "listo";
    return this.crearSalida(salida, { entradaTipo: entrada.tipo });
  }
}
