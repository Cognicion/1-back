import type { EventoCognitivo, IdentificadorModulo } from "./TiposCognitivos";

export type SuscriptorEvento = (evento: EventoCognitivo) => void | Promise<void>;

export interface BusEventosCognitivos {
  publicar(evento: EventoCognitivo): Promise<void>;
  suscribir(modulo: IdentificadorModulo | "todos", suscriptor: SuscriptorEvento): () => void;
}

/**
 * Bus minimo en memoria para desacoplar modulos.
 * No persiste eventos y no depende de Firebase ni proveedores externos.
 */
export class BusEventosSofia implements BusEventosCognitivos {
  private suscriptores = new Map<IdentificadorModulo | "todos", Set<SuscriptorEvento>>();

  async publicar(evento: EventoCognitivo): Promise<void> {
    const destinos = ["todos", evento.destino].filter(Boolean) as Array<IdentificadorModulo | "todos">;
    for (const destino of destinos) {
      const suscriptores = this.suscriptores.get(destino);
      if (!suscriptores) continue;
      for (const suscriptor of suscriptores) {
        await suscriptor(evento);
      }
    }
  }

  suscribir(modulo: IdentificadorModulo | "todos", suscriptor: SuscriptorEvento): () => void {
    if (!this.suscriptores.has(modulo)) this.suscriptores.set(modulo, new Set());
    this.suscriptores.get(modulo)?.add(suscriptor);
    return () => this.suscriptores.get(modulo)?.delete(suscriptor);
  }
}
