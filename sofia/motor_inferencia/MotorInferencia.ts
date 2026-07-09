import { BaseModuloCognitivo } from "../shared/ModuloCognitivo";
import type { EntradaCognitiva, ResultadoProceso } from "../shared/TiposCognitivos";

export interface EntradaMotorInferencia {
  datos: unknown;
  contextoPrevio?: unknown;
  incertidumbre?: number;
}

export interface SalidaMotorInferencia {
  tipo: "inferencia_preparada";
  datos: unknown;
  respuestaCandidata?: unknown;
  validacionesPendientes: string[];
}

/**
 * Modulo: Motor de Inferencia
 *
 * Entradas:
 * - decision_candidata
 * - plan_cognitivo
 * - contexto_global
 *
 * Salidas:
 * - inferencia_preparada
 *
 * Dependencias:
 * - ContratoModuloCognitivo
 * - ProveedorIA opcional futuro
 * - Bus de eventos opcional
 *
 * Eventos previstos:
 * - motor_inferencia.inferencia_solicitada
 * - motor_inferencia.validacion_pendiente
 * - motor_inferencia.inferencia_completada
 * - motor_inferencia.error
 *
 * Responsabilidades futuras:
 * - Construccion de respuestas
 * - Validacion y verificacion
 * - Explicacion y trazabilidad
 * - Priorizacion
 * - Gestion de incertidumbre
 * - Seleccion de herramientas
 * - Seleccion de modelos
 * - Autoevaluacion
 *
 * Nota:
 * - No ejecuta IA todavia. Solo conserva la frontera arquitectonica.
 */
export class MotorInferencia extends BaseModuloCognitivo<EntradaMotorInferencia, SalidaMotorInferencia> {
  constructor() {
    super("motor_inferencia", "Motor de Inferencia");
  }

  entradas(): string[] {
    return ["decision_candidata", "plan_cognitivo", "contexto_global"];
  }

  async procesar(entrada: EntradaCognitiva<EntradaMotorInferencia>): Promise<ResultadoProceso<SalidaMotorInferencia>> {
    this.estado = "procesando";
    const salida: SalidaMotorInferencia = {
      tipo: "inferencia_preparada",
      datos: entrada.contenido?.datos ?? entrada.contenido,
      respuestaCandidata: null,
      validacionesPendientes: [
        "validar_fuentes",
        "verificar_seguridad",
        "estimar_incertidumbre",
        "revisar_explicabilidad"
      ]
    };
    this.estado = "listo";
    return this.crearSalida(salida, { entradaTipo: entrada.tipo });
  }
}
