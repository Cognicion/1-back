# Mapa de Circuitos Cerebrales — fase 2

## Resultado

La segunda fase amplía el módulo existente sin sustituir su modelo de grafo ni duplicar anatomía. El catálogo queda en:

- 99 estructuras neuroanatómicas únicas;
- 130 conexiones registradas;
- 12 circuitos declarativos;
- 67 referencias;
- 4 overlays de redes funcionales;
- 5 capas moduladoras;
- 8 recorridos guiados.

La versión de datos es `1.1.0`. El módulo conserva carga diferida: sus módulos ES y su CSS se solicitan únicamente al abrir `Mapa de circuitos` dentro del Laboratorio de Neurofisiología.

La mejora central es de contexto y navegación. La vista predeterminada ahora es `Todas`, los elementos fuera de un filtro se atenúan sin desaparecer y el nivel inicial es `Regiones` en escritorio y `Sistemas` en móvil. Un circuito seleccionado puede forzar visibles sus miembros aunque estén por debajo de la profundidad corriente. `Expandir todo` permite llegar a las 99 entidades cargadas.

## Causas auditadas de las estructuras ocultas

El problema no tenía una sola causa. Se encontró en la composición de la vista, el estilo de atenuación, el encuadre y el espacio útil:

1. `buildView()` partía de los extremos de las conexiones visibles. Una estructura sin una arista activa podía quedar fuera del DOM aunque existiera en `brainRegions.js`. En el catálogo inicial esto dejaba 16 de 58 entidades fuera de la vista base.
2. La escala inicial era `circuito`. Los límites de profundidad y los nodos contraídos podían excluir descendientes antes de que el renderer recibiera la vista.
3. Seleccionar un circuito atenuaba automáticamente todo su contexto. La opacidad anterior era `.14` para nodos y `.12` para conexiones; las etiquetas parecían ausentes aun cuando el SVG seguía conteniéndolas.
4. `fit()` imponía un mínimo legible de `0.85`. En grafos mayores ese mínimo impedía reducir lo suficiente la cámara para contener la extensión completa.
5. El fit podía calcular su alcance ignorando elementos atenuados o usando solo el circuito activo. Por ello no siempre encuadraba todos los nodos que el usuario esperaba ver.
6. Los paneles laterales tenían anchos fijos de 300 y 360 px. En tablet el panel de detalle se superponía al mapa sin que el fit reservara ese espacio.
7. El layout de flujo colocaba secuencias largas en una sola línea. Esto producía extensiones horizontales de varios miles de píxeles, cruces y un zoom excesivamente pequeño.
8. `overflow: clip` en el host y `overflow: hidden` en el viewport hacían más evidente cualquier encuadre incompleto. El viewport debe recortar visualmente la cámara, pero el mundo SVG no debe asumir esos límites como límites del grafo.
9. No existían pantalla completa, modo Solo mapa, paneles redimensionables ni minimapa; por tanto no había una forma directa de recuperar superficie o entender dónde estaba la cámara dentro del grafo.

La corrección conserva `overflow: hidden` donde corresponde a una ventana de cámara, pero el grafo vive en coordenadas de mundo, puede crecer en cualquier dirección y el encuadre se calcula con sus límites reales. El fallback maximizado libera además el `overflow` del host exterior que antes podía recortar el módulo.

## Arquitectura y fuente única de verdad

```text
brainReferences
      ↓
brainRegions + brainConnections + brainCircuits + brainTours
      + brainNetworkLayers
      ↓ validación, índices y vistas derivadas
ConnectomeGraph
      ↓
filtros / búsqueda / pathfinder / aislamiento / lesión / comparación
      ↓
ConnectomeController.buildView()
      ↓
layouts → renderer SVG → minimapa
      ↓
interacción / paneles / breadcrumb / recorridos / alternativa textual
```

Las responsabilidades permanecen separadas:

- `brainRegions.js` es el registro canónico de entidades anatómicas.
- `brainConnections.js` es el registro canónico de aristas dirigidas.
- `brainCircuits.js` declara subgrafos mediante IDs; no copia nodos ni conexiones.
- `brainNetworkLayers.js` declara redes funcionales como overlays; no las convierte en tractos.
- `connectomeData.js` compone los registros, deriva la pertenencia inversa `conexión → circuitos`, crea capas moduladoras y valida referencias de redes.
- `ConnectomeGraph` indexa y valida; búsqueda, filtros, pathfinder y análisis consumen esos índices.
- El controller decide qué subconjunto se presenta según profundidad, visibilidad y acciones explícitas.
- Los layouts calculan posiciones; el renderer dibuja e interactúa, pero no crea anatomía.
- El minimapa consume únicamente las APIs públicas del renderer y no posee datos neuroanatómicos.

El HTML continúa sin información anatómica hardcodeada. Las relaciones jerárquicas que aparecen en niveles amplios son ayudas de renderizado derivadas de `regionPadre`; no ingresan al pathfinder ni al registro canónico.

## Visibilidad y filtros

### Mostrar estructuras

El nuevo selector ofrece cinco modos:

1. `Todas`: muestra todas las estructuras admitidas por el nivel anatómico actual. Es el valor predeterminado. Una selección, circuito, recorrido, capa o conexión puede incorporar sus extremos aunque sean más profundos.
2. `Solo circuito seleccionado`: conserva los nodos y conexiones declarados por el circuito activo.
3. `Circuito + conexiones relacionadas`: añade vecinos de primer salto conectados con los nodos del circuito o foco.
4. `Solo estructuras protagonistas`: usa `nodosProtagonistas`, o la secuencia educativa/nodos del circuito cuando no existe esa lista.
5. `Solo selección actual`: conserva el nodo seleccionado o los dos extremos de la conexión seleccionada.

Los cuatro modos restrictivos son solicitudes explícitas del usuario. Un nodo seleccionado y los extremos de una conexión seleccionada se protegen para que una acción de navegación no borre visualmente su propio foco.

### Elementos fuera del filtro

La preferencia independiente tiene tres estados:

- `Atenuar`: valor predeterminado. Conserva posiciones y nombres; reduce saturación, borde y protagonismo. La opacidad es `.50` para nodos y `.26` para conexiones, y las etiquetas de nodos mantienen color y peso legibles.
- `Ocultar`: elimina de la vista los elementos no coincidentes, pero no altera los registros ni los índices.
- `Mostrar normal`: conserva el contexto sin atenuación.

En colores forzados, los mínimos suben a `.72` para nodos y `.48` para conexiones. La leyenda continúa diferenciando por forma, trazo, etiqueta e iconografía, no solo por color.

### Conexiones densas y capas

`Todas las conexiones conocidas cargadas` habilita también señales moduladoras y relaciones funcionales que normalmente se muestran solo al activar su capa. La interfaz advierte antes de entrar en esta vista densa.

Las capas químicas pueden resaltar conexiones glutamatérgicas, GABAérgicas, dopaminérgicas, serotoninérgicas, noradrenérgicas, colinérgicas o sin transmisor dominante especificado. No se infiere química ausente: el filtro usa únicamente `neurotransmisorPrincipal` registrado.

## Encuadre y cámara

### Encajar todo

`Encajar todo` usa los IDs de todos los nodos y conexiones de la vista renderizada y pide al renderer un fit de alcance `all`. El algoritmo:

1. calcula el bounding box de las formas de nodo y de la geometría de conexiones;
2. resta márgenes asimétricos del viewport;
3. calcula la escala natural por ancho y alto;
4. prioriza contención sobre el mínimo legible cuando el alcance es `all`;
5. centra el bounding box en el área restante.

El margen base es de 68 px. En tablet, si el detalle está abierto como overlay, el margen derecho incorpora el ancho real de ese panel. Así ningún nodo queda debajo del panel después del fit.

`fitRelevant()` aplica el mismo mecanismo al circuito, grupo de memoria, recorrido o conexión activa. Al abrir un circuito se encuadran todos sus nodos declarados, no solo la secuencia principal.

### Centrar selección

`Centrar selección` centra directamente un nodo seleccionado. Para una conexión, circuito o recorrido usa `fitRelevant()`; sin foco activo cae de forma segura en `Encajar todo`.

La búsqueda de una estructura también centra el nodo y asegura una escala mínima útil de `0.82` cuando es posible. Buscar una conexión centra sus extremos mediante el encuadre relevante.

## Pantalla completa y Solo mapa

### Pantalla completa

El botón `Pantalla completa` llama `requestFullscreen()` sobre la raíz del módulo. Al entrar o salir:

- no se reconstruye el controller ni se reinician filtros, selección o recorrido;
- se ocultan encabezado narrativo, aviso y breadcrumb secundario;
- los paneles laterales y sus resizers se ocultan temporalmente, sin perder su estado;
- el workspace ocupa `100dvh`;
- se releen las dimensiones después de dos frames de layout;
- se ejecuta `Encajar todo` y se sincroniza el minimapa.

`Escape` sale de la pantalla completa nativa mediante el navegador y el evento `fullscreenchange` reconcilia el estado. También existe un botón explícito `Salir de pantalla completa` y controles con `aria-pressed`, nombre accesible y tooltip.

Si `requestFullscreen()` no existe o es rechazado, el módulo usa un modo maximizado `position: fixed` sobre la página, bloquea temporalmente el scroll del `body` y libera el clipping del host. `Escape` y el botón de salida desactivan este fallback.

Por seguridad del navegador, una recarga no puede volver a solicitar Fullscreen API sin un nuevo gesto del usuario. Para conservar la preferencia durante la sesión, la restauración usa el fallback maximizado dentro de la página; una nueva entrada nativa sigue requiriendo un clic. Mientras el módulo permanece montado, entrar en fichas, filtrar o seleccionar no hace perder el modo.

### Solo mapa

`Solo mapa` es independiente de Fullscreen. Oculta temporalmente paneles izquierdo y derecho, resizers, encabezado no esencial, breadcrumb, filtros y tarjetas; conserva:

- el grafo;
- controles de cámara esenciales;
- búsqueda compacta;
- leyenda;
- minimapa, si está activo;
- botones para salir de Solo mapa o de pantalla completa.

El cambio solo modifica presentación. El estado de filtros, circuito, nivel, selección y posiciones permanece intacto y el renderer recalcula el área útil.

## Paneles, minimapa y persistencia

Los paneles izquierdo y derecho pueden colapsarse por separado. En escritorio sus anchos se redimensionan con separadores de puntero o con `Flecha izquierda`/`Flecha derecha`; los límites son 236–520 px para el panel izquierdo y 286–620 px para el derecho. En tablet el detalle funciona como overlay y en móvil como panel inferior.

El minimapa es opcional y comienza oculto para reservar la mayor superficie posible al grafo, también en móvil. Al activarlo, el fit reserva margen inferior para que no cubra nodos. Muestra:

- extensión completa de la vista;
- nodos y conexiones simplificados;
- selección y ruta activa;
- rectángulo de la cámara actual.

Un clic mueve la cámara a la coordenada de mundo correspondiente. El minimapa también admite foco de teclado y activación con `Enter` o espacio. Se actualiza por suscripciones a render, viewport y cambios de tamaño.

`sessionStorage`, bajo `cognicion.connectome.view.v3`, conserva durante la sesión:

- zoom y traslación de cámara;
- layout y nivel anatómico;
- modo de visibilidad y política de elementos fuera del filtro;
- selección, circuito, grupo de memoria y criterios de filtro;
- nodos expandidos y contraídos;
- capas moduladoras, redes funcionales y capas químicas;
- modo de todas las conexiones y etiquetas de vías;
- paneles abiertos/cerrados, anchos y ficha de detalle;
- Solo mapa, pantalla completa/fallback y visibilidad del minimapa.

Antes de restaurar, los IDs guardados se comprueban contra el grafo actual. Fullscreen API no se solicita automáticamente tras una recarga; se restaura de forma segura como vista maximizada y `Escape` permite salir.

## Profundidad y expansión anatómica

El selector de profundidad tiene seis niveles:

1. Sistemas.
2. Regiones.
3. Núcleos.
4. Subnúcleos/subcampos.
5. Vías.
6. Sinapsis/receptores.

El último nivel conserva la implementación prudente de la fase 1: muestra conexiones con plasticidad declarada; los receptores y mecanismos se consultan en la ficha y no se convierten artificialmente en núcleos anatómicos.

La profundidad solo cambia el subconjunto renderizado. No elimina datos. Un doble clic en una estructura con hijos alterna expansión/contracción; la ficha ofrece la misma acción de forma accesible.

- `Expandir nivel siguiente` avanza un nivel y recalcula layout y fit.
- `Expandir todo` establece profundidad de subcampo, marca como expandidas todas las entidades con hijos y encaja las 99 estructuras cargadas.
- `Contraer todo` vuelve a regiones y contrae contenedores anatómicos intermedios.

Los circuitos, recorridos y selecciones pueden forzar visibles sus miembros por debajo del límite para no perder una estructura relevante al cambiar de nivel.

## Layouts, clusters y rendimiento

Los seis layouts existentes se conservan: memoria, flujo, red, radial, jerárquico y conceptual. Las mejoras son localizadas:

- el flujo se envuelve en varias columnas y filas en lugar de crear una única línea ilimitada;
- la secuencia declarada ocupa la vía principal y los nodos adyacentes se colocan antes del contexto restante;
- el espaciado usa el tamaño máximo real de etiqueta/nodo;
- una pasada determinista de resolución de colisiones separa cajas superpuestas;
- red y radial aumentan el radio según la cantidad y tamaño de nodos;
- los clusters se empaquetan con separación y padding propios;
- la geometría de conexiones usa curvas y desvíos para evitar cajas de nodos y separar aristas paralelas;
- los contenedores de cluster usan bordes y relleno transparente, por lo que no tapan sus nodos;
- a partir de 70 nodos el controller aumenta automáticamente separación de nodos, columnas, anillos y clusters.

La optimización mantiene las decisiones de arquitectura previas:

- carga diferida del módulo y CSS;
- caché de layouts por estructura y opciones;
- caché de rutas en el pathfinder;
- eventos delegados desde el SVG, sin un listener independiente por nodo;
- `ResizeObserver` para renderer y minimapa;
- recálculo de layout solo cuando cambia la vista o su estructura;
- suspensión de etiquetas secundarias y de conexiones mientras la cámara se mueve, con restauración al detenerse;
- respeto a `prefers-reduced-motion`.

Con 99 nodos no se activa virtualización DOM por viewport: la profundidad anatómica ya limita la vista inicial y el SVG completo permite un fit exacto y un minimapa consistente. Si el catálogo crece a cientos o miles de entidades, el punto de extensión recomendado es añadir culling por bounding box en el renderer sin alterar `ConnectomeGraph` ni los registros.

## Ampliación neuroanatómica

### 41 estructuras nuevas

#### Formación hipocampal y temporal

1. Corteza entorrinal lateral (`corteza_entorrinal_lateral`).
2. Hilus del giro dentado (`hilus_giro_dentado`).
3. CA4 (`ca4`).
4. Presubículo (`presubiculo`).
5. Parasubículo (`parasubiculo`).
6. Giro fusiforme (`giro_fusiforme`).
7. Polo temporal (`polo_temporal`).

#### Sistema septal y diencéfalo

8. Banda diagonal de Broca (`banda_diagonal_broca`).
9. Núcleos septales laterales (`nucleos_septales_laterales`).
10. Núcleo reuniens del tálamo (`nucleo_reuniens_talamo`).
11. Núcleo reticular del tálamo (`nucleo_reticular_talamo`).

#### Cortezas cingulada, prefrontal y parietal

12. Corteza cingulada anterior (`corteza_cingulada_anterior`).
13. Corteza cingulada media (`corteza_cingulada_media`).
14. Corteza prefrontal ventrolateral (`corteza_prefrontal_ventrolateral`).
15. Corteza prefrontal dorsomedial (`corteza_prefrontal_dorsomedial`).
16. Corteza orbitofrontal (`corteza_orbitofrontal`).
17. Giro angular (`giro_angular`).
18. Giro supramarginal (`giro_supramarginal`).
19. Ínsula anterior (`insula_anterior`).

#### Amígdala

20. Núcleo lateral de la amígdala (`nucleo_lateral_amigdala`).
21. Núcleo basal de la amígdala (`nucleo_basal_amigdala`).
22. Núcleo medial de la amígdala (`nucleo_medial_amigdala`).
23. Masas intercaladas de la amígdala (`masas_intercaladas_amigdala`).

#### Ganglios basales y recompensa

24. Globo pálido externo (`globo_palido_externo`).
25. Núcleo subtalámico (`nucleo_subtalamico`).
26. Núcleo accumbens core (`nucleo_accumbens_core`).
27. Núcleo accumbens shell (`nucleo_accumbens_shell`).
28. Habénula lateral (`habenula_lateral`).
29. Núcleo tegmental rostromedial/RMTg (`nucleo_tegmental_rostromedial`).

#### Sistemas moduladores

30. Núcleo del rafe dorsal (`nucleo_rafe_dorsal`).
31. Núcleo del rafe mediano (`nucleo_rafe_mediano`).
32. Locus coeruleus (`locus_coeruleus`).
33. Núcleo tuberomamilar (`nucleo_tuberomamilar`).

#### Tronco encefálico y cerebelo

34. Tronco encefálico (`tronco_encefalico`).
35. Cerebelo (`cerebelo`).
36. Corteza cerebelosa (`corteza_cerebelosa`).
37. Núcleo dentado (`nucleo_dentado_cerebelo`).
38. Núcleos interpuestos del cerebelo (`nucleos_interpuestos_cerebelo`).
39. Núcleo fastigial (`nucleo_fastigial_cerebelo`).
40. Puente (`puente`).
41. Oliva inferior (`oliva_inferior`).

La corteza entorrinal medial, CA2, CA3, CA1, giro dentado, subículo, corteza perirrinal, corteza parahipocampal, DLPFC, vmPFC, corteza parietal posterior, precúneo, complejo basolateral, núcleo central, caudado, putamen, GPi, SNc, SNr, VTA, núcleo accumbens agregado, pálido ventral, septum medial, núcleo basal de Meynert, fórnix y tracto mamilotalámico ya existían y se reutilizan.

### 61 conexiones nuevas y vías representadas

Las 61 aristas añadidas amplían estas familias:

- entorrinal lateral → giro dentado y CA1 por vía perforante/temporoamónica lateral;
- microcircuito giro dentado → hilus → CA4 y continuidad CA1 → alveus/fimbria/fórnix;
- presubículo/parasubículo ↔ entorrinal medial;
- fascículo uncinado para polo temporal/OFC y amígdala/OFC;
- fascículos arqueado, longitudinal superior y longitudinal inferior en relaciones temporofrontales, frontoparietales y temporales;
- banda diagonal y septum → hipocampo/entorrinal por modulación colinérgica o GABAérgica registrada;
- prefrontal medial ↔ reuniens ↔ CA1/subículo;
- control talámico reticular y mediodorsal;
- cadena sensorial → amígdala lateral → basal → central, masas intercaladas y salidas por estría terminal o vía amigdalofugal ventral;
- vía indirecta de ganglios basales: putamen → GPe → subtálamo → GPi/SNr;
- VTA → accumbens core/shell, core/shell → pálido ventral y OFC → core;
- habénula lateral → RMTg → VTA y pálido ventral → habénula;
- rafe dorsal/mediano, locus coeruleus y núcleo tuberomamilar hacia sus blancos principales registrados;
- corteza motora → puente → corteza cerebelosa, oliva inferior → corteza cerebelosa, salidas hacia dentado/interpuestos/fastigial y tálamo/tronco.

Los nombres de vía o fascículo disponibles en las conexiones incluyen: alveus–fimbria–fórnix, fórnix poscomisural, cíngulo, colaterales de Schaffer, fibras musgosas, vía perforante medial/lateral, vía temporoamónica medial/lateral, tracto mamilotalámico, estría terminal, vía amigdalofugal ventral, fascículos uncinado, arqueado, longitudinal superior y longitudinal inferior, fibras corticopontinas/pontocerebelosas, vía olivocerebelosa, vía dentatotalámica y las salidas cerebelosas registradas.

Una vía no se convierte automáticamente en nodo. Los tractos que requieren identidad seleccionable o simulación de lesión propia, como fórnix y tracto mamilotalámico, conservan entidades anatómicas. Otros fascículos se mantienen en `tractoFasciculo` de la conexión hasta justificar una entidad independiente con extremos y referencias adecuados.

### Circuitos y overlays nuevos

Los tres circuitos añadidos son:

1. Sistema septohipocampal modulador (`septohippocampal_modulation`).
2. Circuito prefrontal–reuniens–hipocampal (`prefrontal_reuniens_hippocampal`).
3. Circuito cerebeloso de aprendizaje motor (`cerebellar_learning`).

Se suman a los nueve circuitos de memoria y aprendizaje de la fase 1.

Las cuatro redes funcionales son overlays independientes:

1. Default Mode Network (`default_mode_network`).
2. Central Executive Network (`central_executive_network`).
3. Salience Network (`salience_network`).
4. Frontoparietal Network (`frontoparietal_network`).

Sus relaciones tienen evidencia `modelo_funcional`; una asociación temporal no se presenta como proyección anatómica ni entra por defecto al pathfinder.

Las cinco capas moduladoras derivadas son dopaminérgica, colinérgica, serotoninérgica, noradrenérgica e histaminérgica. Cada capa toma nodos y conexiones ya existentes; no duplica estructuras.

## Decisiones científicas y elementos diferidos

- CA4 se registra como subcampo separado bajo el hilus. El hilus permanece como subregión y no se usa como sinónimo absoluto de CA4.
- El complejo basolateral sigue siendo el contenedor; núcleo lateral y núcleo basal son hijos reutilizables. No se crea un segundo objeto “BLA”.
- La corteza cingulada anterior se mantiene como una sola entidad para evitar duplicarla bajo el alias `ACC`; la cingulada media es independiente.
- Núcleo accumbens conserva su entidad agregada y expande a core/shell. Seleccionar el padre no copia sus hijos.
- `place cells`, `grid cells`, `head-direction cells` y `border cells` siguen siendo `conceptosFuncionales` asociados a nodos, no núcleos anatómicos.
- Masas intercaladas se modelan como grupo celular anatómico y se reservan para el nivel avanzado; no se confunden con una red funcional.
- Dopamina, serotonina, noradrenalina, acetilcolina e histamina se muestran como modulación predominante registrada, no como equivalentes de una función computacional.
- Alveus y fimbria se documentan por ahora en la conexión compuesta CA1 → fórnix (`Alveus-fimbria-fornix`) y no como nodos seleccionables separados.
- Comisura hipocampal, comisura anterior, segmentos regionales del cuerpo calloso y fascículo fronto-occipital inferior quedan diferidos hasta disponer de extremos lateralizados y referencias suficientes. Esto evita crear tractos ambiguos o conexiones sin destino válido.
- El núcleo dorsomedial hipotalámico no se agrega porque ningún circuito de esta fase lo utiliza con una relación bien delimitada.
- La fase no crea nodos de sinapsis, receptor, Ca²⁺ o molécula. Esos niveles continúan como propiedades educativas y enlaces a fisiología; convertirlos en nodos exigirá un modelo multiescala distinto del grafo anatómico.
- La virtualización por viewport queda diferida hasta que el catálogo supere el tamaño para el que el SVG actual ha sido validado.

## Cómo extender los datos

### Agregar una región, núcleo o subcampo

1. Crear una sola entrada en `brainRegions.js` con un `id` estable y único.
2. Declarar `tipo`, `nivelAnatomico`, `regionPadre`, aliases, sistemas, funciones y descripciones por nivel educativo.
3. Asociar referencias existentes o registrar primero la fuente en `brainReferences.js`.
4. Añadir neurotransmisores, receptores o conceptos funcionales solo si están documentados.
5. Si existe en el Atlas 3D, usar `atlasRefs`; no copiar su objeto narrativo.
6. Ejecutar las pruebas de integridad. Un padre inexistente, ID duplicado o referencia ausente debe fallar.

No se agrega el objeto completo a un circuito: el circuito reutiliza únicamente su ID.

### Agregar una conexión

1. Añadir una sola arista a `brainConnections.js`.
2. Usar `origen` y `destino` que ya existan.
3. Declarar dirección y reciprocidad explícitas; no inferirlas.
4. Distinguir `claseEntidad` (`conexion`, `via`, `senal_moduladora` o `relacion_funcional`).
5. Registrar `tractoFasciculo`, polaridad, neurotransmisor predominante, función, evidencia, especies, métodos y referencias cuando la fuente lo sostenga.
6. Incorporar su ID a los circuitos que la reutilicen. `connectomeData.js` derivará automáticamente la pertenencia inversa.

El pathfinder no inventa un salto por similitud de nombre: solo recorre estas aristas y excluye relaciones funcionales por defecto.

### Agregar un circuito

1. Añadir una definición a `brainCircuits.js`.
2. Referenciar exclusivamente IDs existentes en `nodos` y `conexiones`.
3. Usar `nodosProtagonistas` para una vista educativa más compacta cuando sea útil.
4. Añadir `secuencia` y `secuenciaConexiones` solo si el circuito tiene un recorrido lineal defendible.
5. Declarar cautelas y referencias.
6. Asociarlo a `MEMORY_MAP_GROUPS` o crear un recorrido solo cuando corresponda.

### Agregar una red funcional

1. Añadir el overlay a `brainNetworkLayers.js`.
2. Reutilizar IDs de estructuras y relaciones funcionales existentes.
3. Mantener `tipo: "red_funcional"` y `evidencia: "modelo_funcional"` salvo justificación explícita.
4. Explicar límites de atlas, método y estado en `cautelas`.
5. No usar la red como un tracto ni habilitar sus relaciones en el pathfinder anatómico por defecto.

`connectomeData.js` valida que cada nodo, conexión y referencia del overlay exista antes de exportar los datos.

## Archivos

### Nuevos en esta fase

- `js/neurofisiologia/connectome/data/brainNetworkLayers.js`
- `js/neurofisiologia/connectome/rendering/connectomeMinimap.js`
- `js/tests/connectome-layout-geometry.test.mjs`
- `js/tests/connectome-ui.e2e.mjs`
- `js/tests/helpers/chrome-cdp.mjs`
- `docs/mapa-circuitos-cerebrales-fase2.md`

### Modificados en esta fase

- `css/neurofisiologia-connectome.css`
- `js/neurofisiologia/connectome/data/brainReferences.js`
- `js/neurofisiologia/connectome/data/brainRegions.js`
- `js/neurofisiologia/connectome/data/brainConnections.js`
- `js/neurofisiologia/connectome/data/brainCircuits.js`
- `js/neurofisiologia/connectome/data/connectomeData.js`
- `js/neurofisiologia/connectome/rendering/connectomeLayouts.js`
- `js/neurofisiologia/connectome/rendering/connectomeRenderer.js`
- `js/neurofisiologia/connectome/ui/connectomeController.js`
- `js/tests/connectome.test.mjs`
- `js/neurofisiologia/laboratorio-neurofisiologia.js` — marcador de caché del módulo.
- `laboratorio-neurofisiologia.html` — marcador de caché de la entrada lazy.
- `js/config/appVersion.js` — versión visible `1.80` → `1.81`.

No se cambia la arquitectura ni la lógica de módulos ajenos al Laboratorio de Neurofisiología. La modificación global se limita a la versión visible. Los cambios se aplican sobre los archivos existentes y respetan los registros previos; no se reemplazan objetos anatómicos manuales por copias nuevas.

## Validación

La validación final combina invariantes del grafo, geometría pura y escenarios reales en Chrome headless: 19 + 10 + 11 grupos, todos superados.

### Comandos

```powershell
node js/tests/connectome.test.mjs
node js/tests/connectome-layout-geometry.test.mjs
node js/tests/connectome-ui.e2e.mjs
node --check js/neurofisiologia/connectome/ui/connectomeController.js
node --check js/neurofisiologia/connectome/rendering/connectomeRenderer.js
node --check js/neurofisiologia/connectome/rendering/connectomeMinimap.js
git diff --check
```

### Matriz de cierre

| Área | Comprobación | Resultado final |
|---|---|---|
| Integridad | 99 nodos únicos; padres y referencias existentes | PASS — validación estricta, 0 errores/advertencias |
| Integridad | 130 conexiones con extremos existentes | PASS |
| Integridad | 12 circuitos sin copiar objetos anatómicos | PASS |
| Integridad | 4 redes con nodos, aristas y fuentes existentes | PASS |
| Visibilidad | `Todas` predeterminada y circuito completo visible | PASS |
| Filtros | `Atenuar` predeterminado; `Ocultar` solo explícito | PASS — opacidad computada `.5`/`.26` |
| Cámara | `Encajar todo` contiene todos los nodos renderizados | PASS en escritorio, tablet y móvil |
| Cámara | `Centrar selección` y búsqueda centran correctamente | PASS |
| Fullscreen | entrada/salida, Escape, fallback y reflow | PASS |
| Solo mapa | oculta chrome sin reiniciar estado | PASS |
| Paneles | colapso, expansión, resize y persistencia | PASS |
| Expansión | doble clic, siguiente, todo y contraer | PASS |
| Layout | cero superposiciones ilegibles en escenarios objetivo | PASS — seis layouts, 99/99 posiciones |
| Layout | conexiones y clusters no quedan cortados | PASS |
| Minimapa | extensión, cámara, selección y navegación | PASS |
| Motores | búsqueda, filtros, pathfinder, aislamiento y lesión | PASS |
| Estado | zoom, posición, filtros, nivel y expansión persisten | PASS |
| Responsive | escritorio, tablet y móvil | PASS |
| Temas/a11y | claro, oscuro, teclado, foco y colores forzados | PASS |
| Consola | sin errores propios durante carga e interacción | PASS del conectoma; el atlas 3D conserva un error externo preexistente de `three` fuera de este alcance |
| Rendimiento | mapa expandido aceptable y etiquetas suspendidas al mover | PASS |
| Integración | otros módulos del laboratorio sin regresiones | PASS en suites; no se modificaron módulos ajenos |

La traza temporal `console.info("[Connectome] modulo listo", ...)` se conserva para validación manual. Solo informa build, versión y conteos; no contiene información personal.

### Publicación

La publicación se realiza directamente en `origin/main`, según las reglas del repositorio. El cierre operativo debe verificar y reportar junto con la entrega:

- el SHA final mediante `git rev-parse HEAD` y `git ls-remote origin main`;
- la ejecución `pages build and deployment` asociada a ese SHA;
- `https://cognicionlabs.com/laboratorio-neurofisiologia.html?tab=mapa-circuitos`;
- la cadena HTML → loader `v3` → controller/CSS `v3` → módulos de datos;
- la versión visible `1.81` y la versión de datos `1.1.0` realmente servidas.
