export interface SolicitudModeloIA<TEntrada = unknown> {
  proveedor?: string;
  modelo?: string;
  entrada: TEntrada;
  instrucciones?: string;
  parametros?: Record<string, unknown>;
}

export interface RespuestaModeloIA<TSalida = unknown> {
  proveedor: string;
  modelo: string;
  salida: TSalida;
  metadatos?: Record<string, unknown>;
}

/**
 * Contrato preparado para conectar OpenAI, Gemini, Claude, Ollama,
 * modelos locales o APIs propias sin cambiar la logica cognitiva.
 */
export interface ProveedorIA<TEntrada = unknown, TSalida = unknown> {
  nombre: string;
  disponible(): Promise<boolean>;
  ejecutar(solicitud: SolicitudModeloIA<TEntrada>): Promise<RespuestaModeloIA<TSalida>>;
}
