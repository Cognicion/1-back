import { BaseModuloCognitivo } from "../shared/ModuloCognitivo";
import type { EntradaCognitiva, ResultadoProceso } from "../shared/TiposCognitivos";

export interface EntradaRazonamiento {
  datos: unknown;
  contextoPrevio?: unknown;
}

export interface SalidaRazonamiento {
  tipo: "hipotesis_razonadas";
  datos: unknown;
  resumen?: string;
}

/**
 * Modulo: Razonamiento
 *
 * Entradas:
 * - objetivos_activos
 *
 * Salidas:
 * - hipotesis_razonadas
 *
 * Dependencias:
 * - ContratoModuloCognitivo
 * - Bus de eventos opcional mediante inyeccion futura
 *
 * Eventos previstos:
 * - razonamiento.entrada_recibida
 * - razonamiento.procesamiento_completado
 * - razonamiento.error
 *
 * Responsabilidades:
 * - Preparar inferencias, hipotesis y cadenas de razonamiento verificables.
 *
 * Nota:
 * - Esta clase es un esqueleto. No contiene IA, Firebase ni logica clinica.
 */
export class Razonamiento extends BaseModuloCognitivo<EntradaRazonamiento, SalidaRazonamiento> {
  constructor() {
    super("razonamiento", "Razonamiento");
  }

  entradas(): string[] {
    return ["objetivos_activos"];
  }

  async procesar(entrada: EntradaCognitiva<EntradaRazonamiento>): Promise<ResultadoProceso<SalidaRazonamiento>> {
    this.estado = "procesando";
    const salida: SalidaRazonamiento = {
      tipo: "hipotesis_razonadas",
      datos: entrada.contenido?.datos ?? entrada.contenido,
      resumen: "Preparar inferencias, hipotesis y cadenas de razonamiento verificables."
    };
    this.estado = "listo";
    return this.crearSalida(salida, { entradaTipo: entrada.tipo });
  }
}
