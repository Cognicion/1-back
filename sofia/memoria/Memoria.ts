import { BaseModuloCognitivo } from "../shared/ModuloCognitivo";
import type { EntradaCognitiva, ResultadoProceso } from "../shared/TiposCognitivos";

export type TipoMemoriaSofia =
  | "trabajo"
  | "episodica"
  | "semantica"
  | "procedimental"
  | "usuario"
  | "proyectos"
  | "clinica"
  | "conversacional"
  | "vectorial";

export interface EntradaMemoria {
  datos: unknown;
  tipoMemoria?: TipoMemoriaSofia;
  operacion?: "registrar" | "recuperar" | "consolidar" | "indexar" | "olvidar";
}

export interface SalidaMemoria {
  tipo: "memoria_preparada";
  datos: unknown;
  memoriasDisponibles: TipoMemoriaSofia[];
  operacionesPendientes: string[];
}

/**
 * Modulo: Memoria
 *
 * Entradas:
 * - experiencia_cognitiva
 * - interaccion
 * - aprendizaje
 * - consulta_memoria
 *
 * Salidas:
 * - memoria_preparada
 *
 * Dependencias:
 * - ContratoModuloCognitivo
 * - Repositorios de memoria futuros
 * - Indices/vector stores futuros
 *
 * Eventos previstos:
 * - memoria.registro_solicitado
 * - memoria.recuperacion_solicitada
 * - memoria.consolidacion_solicitada
 * - memoria.indexacion_solicitada
 * - memoria.olvido_solicitado
 *
 * Responsabilidades futuras:
 * - Memoria de trabajo
 * - Memoria episodica
 * - Memoria semantica
 * - Memoria procedimental
 * - Memoria del usuario
 * - Memoria de proyectos
 * - Memoria clinica
 * - Memoria conversacional
 * - Memoria vectorial
 * - Recuperacion, consolidacion, indexacion y olvido
 *
 * Nota:
 * - No guarda datos todavia. No usa Firestore, Storage ni bases vectoriales.
 */
export class Memoria extends BaseModuloCognitivo<EntradaMemoria, SalidaMemoria> {
  private readonly memoriasDisponibles: TipoMemoriaSofia[] = [
    "trabajo",
    "episodica",
    "semantica",
    "procedimental",
    "usuario",
    "proyectos",
    "clinica",
    "conversacional",
    "vectorial"
  ];

  constructor() {
    super("memoria", "Memoria");
  }

  entradas(): string[] {
    return ["experiencia_cognitiva", "interaccion", "aprendizaje", "consulta_memoria"];
  }

  async procesar(entrada: EntradaCognitiva<EntradaMemoria>): Promise<ResultadoProceso<SalidaMemoria>> {
    this.estado = "procesando";
    const salida: SalidaMemoria = {
      tipo: "memoria_preparada",
      datos: entrada.contenido?.datos ?? entrada.contenido,
      memoriasDisponibles: this.memoriasDisponibles,
      operacionesPendientes: ["recuperacion", "consolidacion", "indexacion", "olvido"]
    };
    this.estado = "listo";
    return this.crearSalida(salida, { entradaTipo: entrada.tipo });
  }
}
