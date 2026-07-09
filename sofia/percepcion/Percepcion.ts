import { BaseModuloCognitivo } from "../shared/ModuloCognitivo";
import type { EntradaCognitiva, ResultadoProceso } from "../shared/TiposCognitivos";

export interface EntradaPercepcion {
  datos: unknown;
  contextoPrevio?: unknown;
}

export interface SalidaPercepcion {
  tipo: "senal_perceptiva";
  datos: unknown;
  resumen?: string;
}

/**
 * Modulo: Percepcion
 *
 * Entradas:
 * - entrada_bruta
 *
 * Salidas:
 * - senal_perceptiva
 *
 * Dependencias:
 * - ContratoModuloCognitivo
 * - Bus de eventos opcional mediante inyeccion futura
 *
 * Eventos previstos:
 * - percepcion.entrada_recibida
 * - percepcion.procesamiento_completado
 * - percepcion.error
 *
 * Responsabilidades:
 * - Normalizar entradas, detectar modalidad y preparar senales cognitivas iniciales.
 *
 * Nota:
 * - Esta clase es un esqueleto. No contiene IA, Firebase ni logica clinica.
 */
export class Percepcion extends BaseModuloCognitivo<EntradaPercepcion, SalidaPercepcion> {
  constructor() {
    super("percepcion", "Percepcion");
  }

  entradas(): string[] {
    return ["entrada_bruta"];
  }

  async procesar(entrada: EntradaCognitiva<EntradaPercepcion>): Promise<ResultadoProceso<SalidaPercepcion>> {
    this.estado = "procesando";
    const salida: SalidaPercepcion = {
      tipo: "senal_perceptiva",
      datos: entrada.contenido?.datos ?? entrada.contenido,
      resumen: "Normalizar entradas, detectar modalidad y preparar senales cognitivas iniciales."
    };
    this.estado = "listo";
    return this.crearSalida(salida, { entradaTipo: entrada.tipo });
  }
}
