import test from "node:test";
import assert from "node:assert/strict";

import {
  claveEstadoSidebarApuntes,
  inicializarSidebarApuntes
} from "../js/apuntes-sidebar.js";

class ElementoFalso {
  constructor() {
    this.atributos = new Map();
    this.clases = new Set();
    this.eventos = new Map();
    this.eventosEmitidos = [];
    this.inert = false;
    this.title = "";
    this.classList = {
      contains: (clase) => this.clases.has(clase),
      toggle: (clase, activa) => {
        if (activa) this.clases.add(clase);
        else this.clases.delete(clase);
        return Boolean(activa);
      }
    };
  }

  setAttribute(nombre, valor) {
    this.atributos.set(nombre, String(valor));
  }

  getAttribute(nombre) {
    return this.atributos.has(nombre) ? this.atributos.get(nombre) : null;
  }

  hasAttribute(nombre) {
    return this.atributos.has(nombre);
  }

  removeAttribute(nombre) {
    this.atributos.delete(nombre);
  }

  addEventListener(tipo, listener) {
    if (!this.eventos.has(tipo)) this.eventos.set(tipo, new Set());
    this.eventos.get(tipo).add(listener);
  }

  removeEventListener(tipo, listener) {
    this.eventos.get(tipo)?.delete(listener);
  }

  dispatchEvent(evento) {
    this.eventosEmitidos.push(evento);
    for (const listener of this.eventos.get(evento.type) || []) listener(evento);
    return true;
  }

  click() {
    this.dispatchEvent({ type: "click" });
  }
}

function crearMediaQuery(matchesIniciales) {
  const listeners = new Set();
  return {
    matches: matchesIniciales,
    addEventListener(tipo, listener) {
      if (tipo === "change") listeners.add(listener);
    },
    removeEventListener(tipo, listener) {
      if (tipo === "change") listeners.delete(listener);
    },
    cambiar(matches) {
      this.matches = matches;
      for (const listener of [...listeners]) listener({ matches });
    },
    cantidadListeners: () => listeners.size
  };
}

function crearAlmacenamiento(valores = []) {
  const mapa = new Map(valores);
  return {
    getItem: (clave) => mapa.has(clave) ? mapa.get(clave) : null,
    setItem: (clave, valor) => mapa.set(clave, String(valor)),
    valor: (clave) => mapa.get(clave)
  };
}

function crearEscenario({ anchoLateral = true, almacenamiento = crearAlmacenamiento() } = {}) {
  const media = crearMediaQuery(anchoLateral);
  const shell = new ElementoFalso();
  const sidebar = new ElementoFalso();
  const boton = new ElementoFalso();
  class EventoPersonalizado {
    constructor(type, opciones = {}) {
      this.type = type;
      this.detail = opciones.detail;
    }
  }
  const ventana = {
    matchMedia: () => media,
    localStorage: almacenamiento,
    CustomEvent: EventoPersonalizado
  };
  return { media, shell, sidebar, boton, almacenamiento, ventana };
}

test("el sidebar retraído sincroniza geometría semántica, inert y persistencia por usuario", () => {
  assert.equal(
    claveEstadoSidebarApuntes(" medico-1 "),
    "cognicion:apuntes:sidebar-retraida:medico-1"
  );
  assert.notEqual(claveEstadoSidebarApuntes("medico-1"), claveEstadoSidebarApuntes("medico-2"));

  const escenario = crearEscenario();
  const controlador = inicializarSidebarApuntes({
    uid: "medico-1",
    shell: escenario.shell,
    sidebar: escenario.sidebar,
    boton: escenario.boton,
    ventana: escenario.ventana
  });

  assert.ok(controlador);
  assert.equal(escenario.shell.classList.contains("sidebar-retraida"), false);
  assert.equal(escenario.sidebar.inert, false);
  assert.equal(escenario.sidebar.hasAttribute("aria-hidden"), false);
  assert.equal(escenario.boton.getAttribute("aria-expanded"), "true");
  assert.equal(escenario.boton.getAttribute("aria-label"), "Ocultar panel lateral");

  escenario.boton.click();
  assert.equal(controlador.estaRetraida(), true);
  assert.equal(escenario.shell.classList.contains("sidebar-retraida"), true);
  assert.equal(escenario.sidebar.inert, true);
  assert.equal(escenario.sidebar.getAttribute("aria-hidden"), "true");
  assert.equal(escenario.boton.getAttribute("aria-expanded"), "false");
  assert.equal(escenario.boton.getAttribute("aria-label"), "Mostrar panel lateral");
  assert.equal(
    escenario.almacenamiento.valor(claveEstadoSidebarApuntes("medico-1")),
    "1"
  );
  assert.deepEqual(escenario.shell.eventosEmitidos.at(-1).detail, { retraida: true, oculta: true });

  escenario.boton.click();
  assert.equal(escenario.sidebar.inert, false);
  assert.equal(escenario.sidebar.hasAttribute("aria-hidden"), false);
  assert.equal(escenario.boton.getAttribute("aria-expanded"), "true");
  assert.equal(
    escenario.almacenamiento.valor(claveEstadoSidebarApuntes("medico-1")),
    "0"
  );
});

test("la preferencia se restaura, no oculta el sidebar móvil y reaparece al volver a escritorio", () => {
  const clave = claveEstadoSidebarApuntes("medico-persistente");
  const almacenamiento = crearAlmacenamiento([[clave, "1"]]);
  const escenario = crearEscenario({ anchoLateral: false, almacenamiento });
  const controlador = inicializarSidebarApuntes({
    uid: "medico-persistente",
    shell: escenario.shell,
    sidebar: escenario.sidebar,
    boton: escenario.boton,
    ventana: escenario.ventana
  });

  assert.equal(controlador.estaRetraida(), true);
  assert.equal(escenario.shell.classList.contains("sidebar-retraida"), true);
  assert.equal(escenario.sidebar.inert, false, "en móvil el contenido debe seguir disponible");
  assert.equal(escenario.sidebar.hasAttribute("aria-hidden"), false);
  assert.equal(escenario.boton.getAttribute("aria-expanded"), "true");

  escenario.media.cambiar(true);
  assert.equal(escenario.sidebar.inert, true);
  assert.equal(escenario.sidebar.getAttribute("aria-hidden"), "true");
  assert.equal(escenario.boton.getAttribute("aria-expanded"), "false");

  escenario.media.cambiar(false);
  assert.equal(escenario.sidebar.inert, false);
  assert.equal(escenario.sidebar.hasAttribute("aria-hidden"), false);
  assert.equal(escenario.boton.getAttribute("aria-expanded"), "true");

  controlador.destruir();
  assert.equal(escenario.media.cantidadListeners(), 0);
  escenario.media.cambiar(true);
  assert.equal(escenario.sidebar.inert, false, "destruir elimina la reacción al breakpoint");
});
