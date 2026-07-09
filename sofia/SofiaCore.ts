import { Atencion } from "./atencion/Atencion";
import { ControlEjecutivo } from "./control_ejecutivo/ControlEjecutivo";
import { EspacioTrabajoGlobal } from "./espacio_trabajo_global/EspacioTrabajoGlobal";
import { Memoria } from "./memoria/Memoria";
import { MotorInferencia } from "./motor_inferencia/MotorInferencia";
import { Objetivos } from "./objetivos/Objetivos";
import { Percepcion } from "./percepcion/Percepcion";
import { Planificacion } from "./planificacion/Planificacion";
import { Razonamiento } from "./razonamiento/Razonamiento";
import { TomaDecisiones } from "./toma_decisiones/TomaDecisiones";
import { BusEventosSofia } from "./shared/BusEventosSofia";
import type { EntradaCognitiva, ResultadoProceso } from "./shared/TiposCognitivos";

export interface ResultadoFlujoSofia {
  pasos: ResultadoProceso[];
  salidaFinal: ResultadoProceso;
}

/**
 * Nucleo orquestador de SOFIA.
 *
 * Flujo previsto:
 * Entrada -> Percepcion -> Atencion -> Espacio de Trabajo Global ->
 * Control Ejecutivo -> Objetivos -> Razonamiento -> Planificacion ->
 * Toma de Decisiones -> Motor de Inferencia -> Interaccion ->
 * Aprendizaje -> Memoria.
 *
 * Interaccion y Aprendizaje quedan como puntos de extension futuros.
 * Este nucleo no depende de Firebase, paginas, autenticacion ni proveedores IA.
 */
export class SofiaCore {
  readonly eventos = new BusEventosSofia();

  readonly percepcion = new Percepcion();
  readonly atencion = new Atencion();
  readonly espacioTrabajoGlobal = new EspacioTrabajoGlobal();
  readonly controlEjecutivo = new ControlEjecutivo();
  readonly objetivos = new Objetivos();
  readonly razonamiento = new Razonamiento();
  readonly planificacion = new Planificacion();
  readonly tomaDecisiones = new TomaDecisiones();
  readonly motorInferencia = new MotorInferencia();
  readonly memoria = new Memoria();

  async procesarEntrada(entrada: EntradaCognitiva): Promise<ResultadoFlujoSofia> {
    const pasos: ResultadoProceso[] = [];

    const percepcion = await this.percepcion.procesar({ ...entrada, tipo: "entrada_bruta" });
    pasos.push(percepcion);

    const atencion = await this.atencion.procesar({ tipo: "senal_perceptiva", contenido: { datos: percepcion.salida.contenido } });
    pasos.push(atencion);

    const espacio = await this.espacioTrabajoGlobal.procesar({ tipo: "foco_atencional", contenido: { datos: atencion.salida.contenido } });
    pasos.push(espacio);

    const control = await this.controlEjecutivo.procesar({ tipo: "contexto_global", contenido: { datos: espacio.salida.contenido } });
    pasos.push(control);

    const objetivos = await this.objetivos.procesar({ tipo: "directiva_ejecutiva", contenido: { datos: control.salida.contenido } });
    pasos.push(objetivos);

    const razonamiento = await this.razonamiento.procesar({ tipo: "objetivos_activos", contenido: { datos: objetivos.salida.contenido } });
    pasos.push(razonamiento);

    const planificacion = await this.planificacion.procesar({ tipo: "hipotesis_razonadas", contenido: { datos: razonamiento.salida.contenido } });
    pasos.push(planificacion);

    const decision = await this.tomaDecisiones.procesar({ tipo: "plan_cognitivo", contenido: { datos: planificacion.salida.contenido } });
    pasos.push(decision);

    const inferencia = await this.motorInferencia.procesar({ tipo: "decision_candidata", contenido: { datos: decision.salida.contenido } });
    pasos.push(inferencia);

    const memoria = await this.memoria.procesar({ tipo: "aprendizaje", contenido: { datos: inferencia.salida.contenido } });
    pasos.push(memoria);

    return {
      pasos,
      salidaFinal: memoria
    };
  }

  reiniciar(): void {
    this.percepcion.reiniciar();
    this.atencion.reiniciar();
    this.espacioTrabajoGlobal.reiniciar();
    this.controlEjecutivo.reiniciar();
    this.objetivos.reiniciar();
    this.razonamiento.reiniciar();
    this.planificacion.reiniciar();
    this.tomaDecisiones.reiniciar();
    this.motorInferencia.reiniciar();
    this.memoria.reiniciar();
  }
}
