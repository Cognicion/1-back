import type {
  ConfiguracionModulo,
  EntradaCognitiva,
  EstadoModulo,
  IdentificadorModulo,
  ResultadoProceso,
  SalidaCognitiva
} from "./TiposCognitivos";

export interface ContratoModuloCognitivo<TEntrada = unknown, TSalida = unknown> {
  readonly id: IdentificadorModulo;
  readonly nombre: string;

  /** Entradas esperadas por el modulo. */
  entradas(): string[];

  /** Procesa una entrada cognitiva y devuelve una salida tipada. */
  procesar(entrada: EntradaCognitiva<TEntrada>): Promise<ResultadoProceso<TSalida>>;

  /** Devuelve estado interno no sensible. */
  obtenerEstado(): EstadoModulo;

  /** Reinicia estado volatil del modulo. */
  reiniciar(): void;

  /** Configura parametros sin acoplarse a proveedores externos. */
  configurar(configuracion: ConfiguracionModulo): void;
}

export abstract class BaseModuloCognitivo<TEntrada = unknown, TSalida = unknown>
  implements ContratoModuloCognitivo<TEntrada, TSalida> {
  protected estado: EstadoModulo = "listo";
  protected configuracion: ConfiguracionModulo = { habilitado: true };

  protected constructor(
    public readonly id: IdentificadorModulo,
    public readonly nombre: string
  ) {}

  abstract entradas(): string[];
  abstract procesar(entrada: EntradaCognitiva<TEntrada>): Promise<ResultadoProceso<TSalida>>;

  obtenerEstado(): EstadoModulo {
    return this.estado;
  }

  reiniciar(): void {
    this.estado = "listo";
  }

  configurar(configuracion: ConfiguracionModulo): void {
    this.configuracion = { ...this.configuracion, ...configuracion };
  }

  protected crearSalida(contenido: TSalida, metadatos: Record<string, unknown> = {}): ResultadoProceso<TSalida> {
    const salida: SalidaCognitiva<TSalida> = {
      modulo: this.id,
      estado: this.estado,
      contenido,
      metadatos
    };

    return { exito: true, salida };
  }
}
