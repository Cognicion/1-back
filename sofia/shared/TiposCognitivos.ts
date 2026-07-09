export type IdentificadorModulo =
  | "percepcion"
  | "atencion"
  | "espacio_trabajo_global"
  | "control_ejecutivo"
  | "objetivos"
  | "razonamiento"
  | "planificacion"
  | "toma_decisiones"
  | "motor_inferencia"
  | "memoria";

export type EstadoModulo = "inactivo" | "listo" | "procesando" | "error";

export interface EntradaCognitiva<T = unknown> {
  id?: string;
  tipo: string;
  contenido: T;
  contexto?: ContextoCognitivo;
  metadatos?: Record<string, unknown>;
}

export interface SalidaCognitiva<T = unknown> {
  modulo: IdentificadorModulo;
  estado: EstadoModulo;
  contenido: T;
  eventos?: EventoCognitivo[];
  metadatos?: Record<string, unknown>;
}

export interface ContextoCognitivo {
  usuarioId?: string;
  sesionId?: string;
  proyectoId?: string;
  pacienteId?: string;
  objetivoActual?: string;
  restricciones?: string[];
  trazas?: string[];
}

export interface ConfiguracionModulo {
  habilitado?: boolean;
  nivelDetalle?: "bajo" | "medio" | "alto";
  proveedorModelo?: string;
  parametros?: Record<string, unknown>;
}

export interface EventoCognitivo<T = unknown> {
  tipo: string;
  origen: IdentificadorModulo | "sofia";
  destino?: IdentificadorModulo | "todos";
  fecha: string;
  payload?: T;
}

export interface ResultadoProceso<T = unknown> {
  exito: boolean;
  salida: SalidaCognitiva<T>;
  errores?: string[];
}
