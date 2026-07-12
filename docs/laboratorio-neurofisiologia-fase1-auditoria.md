# Laboratorio de Neurofisiologia - Fase 1: Auditoria y arquitectura

Fecha: 2026-07-12

## Alcance de esta fase

Esta fase no implementa el cerebro 3D completo. Deja documentada la arquitectura actual del Laboratorio de Neurofisiologia y la ruta tecnica segura para agregar dos sistemas nuevos:

1. Biblioteca/motor de ecuaciones bioelectricas.
2. Simulador 3D anatomico interactivo, iniciando por lobulo temporal izquierdo.

La indicacion principal es ampliar el laboratorio sin sustituir el motor existente ni sobrescribir cambios manuales.

## Archivos revisados

- `laboratorio-neurofisiologia.html`
- `css/laboratorio-neurofisiologia.css`
- `js/neurofisiologia/laboratorio-neurofisiologia.js`
- `js/neurofisiologia/ionModel.js`
- `js/neurofisiologia/actionPotentialModel.js`
- `js/neurofisiologia/axonPropagationModel.js`
- `js/neurofisiologia/integratedNeuronModel.js`
- `js/neurofisiologia/integratedNeuronRenderer.js`
- `js/neurofisiologia/curvedMembraneRenderer.js`
- `js/neurofisiologia/equationRegistry.js`
- `js/neurofisiologia/drugRegistry.js`
- `js/neurofisiologia/experimentManager.js`
- `js/neurofisiologia/labNotebook.js`
- `js/neurofisiologia/learningModeController.js`
- `dashboard.html` para confirmar acceso al laboratorio.

## Arquitectura actual encontrada

El laboratorio esta implementado como una pagina independiente:

- Ruta: `laboratorio-neurofisiologia.html`
- Estilos: `css/laboratorio-neurofisiologia.css`
- Punto de entrada JS: `js/neurofisiologia/laboratorio-neurofisiologia.js`
- Carga mediante `<script type="module">`.

La pagina usa pestañas internas con botones `data-tab` y paneles `#tab-*`:

- `integrada`: neurona, axon y sinapsis sincronizados.
- `membrana`: membrana neuronal e intercambio ionico.
- `accion`: potencial de accion.
- `axon`: propagacion axonal.
- `experimentos`: protocolos preconfigurados.
- `resultados`: cuaderno/proyectos.
- `teoria`: fundamento teorico.

El laboratorio ya tiene un patron claro de modularidad por motores y renderers, por lo que la ampliacion debe respetar esta separacion.

## Motores matematicos actuales

- `ionModel.js`: constantes fisiologicas, Nernst, GHK, flujos ionicos, tabla ionica.
- `actionPotentialModel.js`: Hodgkin-Huxley educativo reducido, fases del potencial, corrientes y compuertas.
- `axonPropagationModel.js`: velocidad de conduccion y propagacion axonal.
- `integratedNeuronModel.js`: estado sincronizado de neurona, axon, sinapsis y farmacologia.
- `equationRegistry.js`: registro de ecuaciones y evaluacion formateada.

Conclusion: no se debe crear otro motor paralelo para Nernst/GHK/HH. La biblioteca bioelectrica nueva debe extender `equationRegistry.js` o conectarse por un modulo puente, reutilizando estos modelos.

## Renderizado actual

El laboratorio no usa Three.js, Babylon.js ni WebGL actualmente. La visualizacion principal usa:

- DOM/CSS para partes del simulador.
- Canvas 2D para graficas y escena integrada.
- `curvedMembraneRenderer.js` como renderer avanzado en canvas 2D.
- `integratedNeuronRenderer.js` como puente entre estado integrado, graficas y escena.

El modo `modelo3d` existente es una representacion educativa en canvas, no un visor 3D WebGL real.

## Sistema de controles, paneles y ayuda

Se identificaron patrones ya existentes:

- Botones por ID enlazados desde `laboratorio-neurofisiologia.js`.
- Tooltips y ayudas contextuales generadas sobre `.controles-lab label`.
- Panel de seleccion `#detalleIntegradaSeleccion`.
- Tutorial guiado `#tutorialNeuro`.
- Preferencia de tutorial en `localStorage`: `cognicionNeuroTutorialVisto`.
- Cuaderno/proyectos en `localStorage` mediante `labNotebook.js`.

La nueva pestaña Cerebro 3D debe reutilizar estos patrones visuales: tabs, paneles, botones, ayuda contextual, cierre con X/Escape, y persistencia en localStorage.

## Dependencias graficas

No se detectaron referencias a:

- Three.js
- Babylon.js
- OrbitControls
- GLTFLoader
- WebGL externo

Decision tecnica recomendada para Fase 2: usar Three.js como dependencia aislada para la nueva pestaña `Cerebro 3D`, preferentemente mediante imports ES module. No duplicar si mas adelante se incorpora por import map o empaquetador.

## Propuesta de arquitectura nueva

Ubicacion recomendada, respetando la estructura actual:

`js/neurofisiologia/brain3d/`

Modulos sugeridos por responsabilidad:

- `brain3d-controller.js`: inicializacion y orquestacion de la pestaña.
- `brain3d-scene.js`: escena, luces, renderer y fallback WebGL.
- `brain3d-camera.js`: camaras, vistas predefinidas y restauracion.
- `brain3d-controls.js`: rotacion, zoom, paneo, teclado y mouse.
- `brain3d-selection.js`: raycasting, seleccion multiple, foco y resaltado.
- `brain3d-labels.js`: etiquetas anatomicas y visibilidad.
- `brain3d-layers.js`: capas visibles, transparencia, aislamiento y bloqueo.
- `brain3d-state.js`: estado persistente del visor.
- `brain3d-performance.js`: calidad grafica, LOD, pausa y limpieza.
- `brain3d-help.js`: textos de ayuda contextual de los controles 3D.
- `brain3d-equation-bridge.js`: conexion con `equationRegistry.js`.
- `brain3d-simulation-bridge.js`: conexion con neurona/sinapsis/axon existentes.
- `temporal-lobe-atlas.js`: catalogo inicial del lobulo temporal izquierdo.
- `temporal-lobe-connections.js`: tractos y conexiones educativas.
- `temporal-lobe-microstructure.js`: capas, hipocampo, amigdalas y microcircuitos progresivos.

## Nueva pestaña propuesta

Agregar en una fase posterior:

- Boton `data-tab="cerebro3d"` con texto `Cerebro 3D`.
- Panel `#tab-cerebro3d`.
- Contenedor WebGL propio para no interferir con `escenaIntegrada`.
- Panel derecho con informacion anatomica.
- Panel izquierdo con capas/filtros.
- Fallback textual si WebGL no esta disponible.

## Integracion con ecuaciones

La biblioteca de ecuaciones debe dividirse en dos niveles:

1. Registro de ecuaciones reutilizable:
   - Nernst
   - GHK
   - Hodgkin-Huxley
   - teoria de cable
   - modelos sinapticos
   - canales, bombas y transportadores

2. Puente anatomico:
   - Una estructura seleccionada puede declarar que ecuaciones acepta.
   - Ejemplo: CA1 puede activar HH, integrate-and-fire, sinapsis AMPA/NMDA, oscilacion theta.
   - Ejemplo: fasciculo arqueado puede activar teoria de cable y velocidad de conduccion.

No se deben presentar valores anatomicos como mediciones reales del paciente; deben etiquetarse como aproximaciones educativas.

## Riesgos tecnicos detectados

- `laboratorio-neurofisiologia.js` ya es grande; agregar 3D ahi aumentaria fragilidad. Recomendacion: solo importar/controlar un modulo `brain3d-controller.js`.
- El CSS actual esta concentrado en un archivo grande. Recomendacion: agregar bloque CSS especifico o archivo CSS nuevo solo si la pagina lo permite.
- El visor 3D no debe capturar scroll global ni bloquear botones existentes.
- Debe existir limpieza de recursos WebGL al salir de la pestaña o bajar calidad.
- Si Three.js se carga desde CDN, la red puede fallar; se requiere fallback.

## Fase 2 recomendada

Implementar una base minima, no el lobulo completo:

1. Agregar pestaña `Cerebro 3D`.
2. Crear contenedor y UI basica de visor.
3. Cargar Three.js de forma aislada o definir punto de dependencia.
4. Crear escena WebGL con fallback.
5. Crear un modelo placeholder anatomico del lobulo temporal izquierdo con geometria educativa propia.
6. Habilitar rotar, zoom, pan, seleccionar y cerrar paneles.
7. Preparar `temporal-lobe-atlas.js` con estructuras iniciales, sin inventar limites clinicos finos.
8. Conectar una estructura seleccionada con `equationRegistry.js` mediante `brain3d-equation-bridge.js`.

## Validaciones realizadas en esta fase

- `node --check js/neurofisiologia/laboratorio-neurofisiologia.js`
- `node --check js/neurofisiologia/curvedMembraneRenderer.js`
- `node --check js/neurofisiologia/integratedNeuronModel.js`

Resultado: sin errores de sintaxis en los modulos revisados.

## Cambios realizados en esta fase

Solo se agrega este documento de auditoria y arquitectura. No se modifica el motor del laboratorio ni los renderers actuales.

## Pendientes

- Implementar Fase 2: visor 3D base.
- Definir forma exacta de carga de Three.js segun estrategia del proyecto.
- Agregar pruebas manuales en navegador con consola abierta.
- Validar rendimiento en laptop/tablet.
- Crear atlas inicial del lobulo temporal izquierdo sin prometer precision de neuroimagen clinica.