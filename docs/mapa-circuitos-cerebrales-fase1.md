# Mapa de circuitos cerebrales — fase 1

## Resultado

El Laboratorio de Neurofisiologia incorpora un grafo dirigido, interactivo y extensible centrado en memoria y aprendizaje. La version inicial contiene 58 entidades anatomicas unicas, 69 conexiones, 9 circuitos, 8 recorridos y 43 referencias. El modulo se importa solo al abrir `Mapa de circuitos`; su hoja de estilos tambien se agrega bajo demanda.

El mapa es educativo. Las flechas expresan relaciones predominantes declaradas, no actividad neuronal real medida ni conectividad individual. Las asociaciones funcionales incluyen nivel de evidencia, especies y metodos cuando corresponde.

## Arquitectura y flujo de datos

```text
atlasCerebralData (entidades ya existentes)
             ↓ adaptador, sin copiar texto manualmente
brainReferences + brainRegions + brainConnections + brainCircuits + brainTours
             ↓ validacion e indices
        ConnectomeGraph
             ↓
busqueda / filtros / pathfinder / aislamiento / comparacion / lesion
             ↓
layouts → renderer SVG → controller de interaccion
             ↓
panel de informacion / leyenda / breadcrumb / recorridos / alternativa textual
```

La fuente unica de verdad anatomica del modulo son los registros declarativos. El HTML no contiene anatomia; el renderer no inventa conexiones canonicas; un circuito almacena solo IDs de nodos y conexiones. La pertenencia `conexion → circuitos` es una vista derivada de `brainCircuits.js`, por lo que no puede divergir. Para la escala de sistema, el controller materializa relaciones jerarquicas no interactivas a partir de `regionPadre`; son ayudas de renderizado y quedan excluidas del registro canonico, el pathfinder y el analisis de lesiones.

Las estructuras que ya existen exactamente en el Atlas 3D (`brain` y `thalamus`) se adaptan desde `atlasCerebralData.js`. Las agregaciones bilaterales nuevas enlazan instancias del atlas mediante `atlasRefs`; no repiten sus objetos narrativos.

## Esquema de datos

### Entidad anatomica

`brainRegions.js` registra cortezas, regiones, nucleos, subcampos y tractos seleccionables. Todos usan ID estable y un `tipo` explicito; por eso un tracto como el fornix no se confunde con una proyeccion sin nombre.

Campos principales:

```js
{
  id,
  nombre,
  nombreCompleto,
  aliases,
  tipo,
  nivelAnatomico,
  regionPadre,
  hemisferio,
  sistemas,
  funciones,
  descripcion: { basico, intermedio, avanzado },
  neurotransmisoresRelevantes,
  receptoresRelevantes,
  patologiasRelacionadas,
  porQueImporta,
  conceptosFuncionales,
  atlasRefs,
  fisiologiaTargets,
  evidencia,
  referencias
}
```

### Conexion

`brainConnections.js` registra aristas dirigidas. Una arista distingue su entidad (`conexion`, `via`, `senal_moduladora` o `relacion_funcional`), direccion, polaridad, neurotransmisor, funcion, plasticidad y trazabilidad.

```js
{
  id,
  origen,
  destino,
  nombre,
  tipo,
  claseEntidad,
  direccion,
  polaridad,
  tractoFasciculo,
  neurotransmisorPrincipal,
  funcion,
  importanciaAprendizaje,
  plasticidad,
  evidencia,
  especies,
  tiposEvidencia,
  etiquetas,
  referencias
}
```

No se presume reciprocidad, polaridad ni neurotransmisor. `reciproca` habilita traversal en ambos sentidos; el resto conserva `origen → destino`. Cuando la fuente no permite especificar quimica se conserva `no_especificada`; las relaciones funcionales usan `no_aplica`. El pathfinder de la interfaz excluye por defecto `relacion_funcional`, aunque esas aristas pueden visualizarse como modelos de red.

### Circuito

`brainCircuits.js` declara subgrafos y nunca copia objetos anatomicos:

```js
{
  id,
  nombre,
  categoria,
  descripcion,
  evidencia,
  funciones,
  nodos: ["id_nodo"],
  conexiones: ["id_conexion"],
  secuencia: ["id_nodo"],
  secuenciaConexiones: ["id_conexion"],
  neurotransmisores,
  etiquetas,
  cautelas,
  referencias
}
```

`secuencia` solo representa un recorrido educativo cuando el subgrafo admite una lectura ordenada. La lista completa de `nodos` y `conexiones` sigue siendo la definicion del circuito.

## Como extenderlo

### Agregar una region, nucleo, subcampo o tracto

1. Agregar una unica entidad en `brainRegions.js` con ID nuevo y `regionPadre` existente.
2. Asociar referencias ya registradas o agregarlas primero en `brainReferences.js`.
3. Si existe en el Atlas 3D, usar el adaptador/`atlasRefs`; no copiar su descripcion.
4. Ejecutar `node js/tests/connectome.test.mjs` para validar ID, padre y referencias.

### Agregar una conexion

1. Agregarla una vez a `brainConnections.js`.
2. Usar solamente IDs de extremos existentes.
3. Declarar direccion, tipo de entidad, polaridad, evidencia y referencias; no asumir reciprocidad.
4. Incorporar su ID en cada circuito que la reutilice. La pertenencia inversa se deriva automaticamente.

### Agregar un circuito

1. Agregar un registro a `brainCircuits.js`.
2. Referenciar exclusivamente IDs existentes en `nodos` y `conexiones`.
3. Agregar `secuencia` solo si no fuerza una red distribuida a parecer una cadena unica.
4. Agregarlo a un grupo de `MEMORY_MAP_GROUPS`, si corresponde, y opcionalmente crear un recorrido en `brainTours.js`.

## Motores del grafo

### Busqueda y filtros

La busqueda normaliza acentos y consulta IDs, nombres, alias, funciones, conexiones y circuitos. Los filtros devuelven conjuntos de coincidencias y conjuntos atenuados; no borran ni mutan el registro canonico. Hay filtros por sistema, circuito, neurotransmisor, region, direccion, tipo, etiquetas tematicas y plasticidad, ademas de capas dopaminergica y colinergica derivadas.

El cambio de escala es semantico: `sistema` muestra agregaciones y relaciones jerarquicas derivadas; `circuito`, `region`, `nucleo` y `subcampo` incorporan progresivamente entidades canonicas; `sinapsis` limita la vista inicial a conexiones con plasticidad declarada. Ninguna escala agrega aristas anatomicas al registro.

### Pathfinder

`ConnectomePathfinder` recorre solamente las aristas registradas, respeta direccion y reciprocidad explicita, evita ciclos por defecto y limita profundidad, numero de rutas y estados explorados. Admite subgrafos de circuito, listas permitidas y exclusiones producidas por lesiones. Sus resultados contienen IDs de nodos y conexiones, pasos y objetos resueltos; nunca crea una ruta desde texto libre.

La caché usa origen, destino y restricciones como clave. Cambiar el registro invalida la instancia del grafo, no recalcula una ruta en cada frame.

### Aislamiento, comparacion y lesion

- `isolateNode` obtiene el foco, aferencias, eferencias y vecinos.
- `isolateCircuit` devuelve exactamente el subgrafo declarado.
- `compareCircuits` calcula nodos, conexiones y neurotransmisores compartidos o exclusivos por IDs.
- `simulateNodeLesion` y `simulateConnectionLesion` excluyen entidades sobre una copia logica, vuelven a calcular alcance/componentes e informan circuitos y funciones potencialmente afectados.

La simulacion de lesion es un analisis educativo de la base actual, no un pronostico clinico. Una conexion puede perderse sin aumentar el numero global de componentes y aun asi interrumpir una secuencia dirigida; ambos resultados se muestran por separado.

### Layouts y rendimiento

El renderer SVG usa eventos delegados para nodos y conexiones. Conserva pan/zoom y posiciones arrastradas; los layouts solo se recalculan cuando cambia la vista o su estructura. Hay caché de layouts, rutas y subgrafos. La fase actual ofrece `memoria`, `flujo`, `red`, `radial`, `jerarquico` y `conceptual`.

## Interaccion y aprendizaje

- Hover, clic, doble clic, arrastre, rueda, seleccion multiple y menu contextual.
- Centrado, expansion/contraccion, aislamiento y lesion de nodos o conexiones.
- Busqueda de rutas entre dos estructuras.
- Seguimiento paso a paso, anterior/siguiente, reproduccion, pausa y respeto a movimiento reducido.
- Modos exploracion, aprendizaje y pregunta local preparada para SOFIA.
- Niveles basico, intermedio y avanzado.
- Paneles de estructura, conexion y circuito con fuentes y cautelas.
- Breadcrumb anatomico, leyenda multimodal y alternativa textual.
- Escritorio con tres columnas, tablet con panel superpuesto colapsable y movil con panel inferior deslizable; ambos incluyen cierre accesible y reabren el detalle al seleccionar.
- Navegacion por teclado, foco visible, Enter/Escape, `tablist` y `tabpanel` con ARIA.

Los 8 recorridos iniciales son:

1. Como se forma un recuerdo episodico.
2. Circuito hipocampal paso a paso.
3. Que hace CA3.
4. Que hace CA1.
5. Como participa la corteza entorrinal.
6. Circuito de Papez.
7. Memoria de trabajo.
8. Aprendizaje por recompensa.

## Estructuras incluidas

La fase 1 incluye jerarquias y subestructuras para:

- sistema nervioso central, encefalo, telencefalo, diencefalo y mesencefalo;
- region temporal medial, formacion hipocampal, hipocampo, giro dentado, CA1, CA2, CA3 y subiculo;
- cortezas entorrinal, entorrinal medial, perirrinal y parahipocampal;
- fornix, cuerpos mamilares, tracto mamilotalamico, talamo, nucleos anteriores y nucleo mediodorsal;
- giro cingulado, cingulo, corteza retrosplenial, cingulada posterior y precuneo;
- corteza prefrontal y sus regiones medial, ventromedial y dorsolateral; corteza parietal posterior;
- regiones temporales anterior/lateral, corteza asociativa multimodal y cortezas sensoriales asociativas;
- amigdala, amigdala basolateral y central, hipotalamo y sustancia gris periacueductal;
- ganglios basales, estriado, caudado, putamen, nucleo accumbens, globo palido, GPi, sustancia negra, SNc, SNr y palido ventral;
- VTA, corteza motora, septum medial y nucleo basal de Meynert.

## Circuitos incluidos

1. Circuito trisináptico hipocampal.
2. Circuito de Papez.
3. Red de memoria episodica.
4. Red de memoria semantica.
5. Memoria de trabajo frontoparietal-talamica.
6. Aprendizaje procedimental corticoestriatal.
7. Memoria emocional y condicionamiento.
8. Recompensa y aprendizaje por refuerzo.
9. Navegacion espacial.

El giro dentado, CA3 y CA1 muestran separacion, completamiento y comparacion/integracion de patrones como asociaciones funcionales prudentes, no funciones absolutas. Papez se presenta como circuito historico integrado en una red moderna de memoria, no como explicacion completa de la emocion. Dopamina se presenta como modulador; el error de prediccion es un modelo computacional, no sinonimo anatomico de recompensa.

## Integraciones y fases futuras

- `fisiologiaTargets` y el evento `neuro-connectome:open-physiology` enlazan nodos/conexiones con la neurona integrada y la vista de sinapsis. Desde la neurona integrada se puede volver al mapa.
- `extensionPoints.farmacologia` reserva overlays por receptores sin implementar aun un catalogo completo de farmacos.
- `ConnectomeQuestionBridge` define el contrato local para SOFIA y rechaza IDs no existentes; no llama una API remota.
- La arquitectura admite nuevas capas moduladoras, vias motoras/sensitivas, cerebelo, lenguaje, atencion, saliencia, DMN, sueño, dolor y control autonomico sin reemplazar el motor.

## Archivos

### Nuevos

- `css/neurofisiologia-connectome.css`
- `js/neurofisiologia/connectome/data/brainReferences.js`
- `js/neurofisiologia/connectome/data/brainRegions.js`
- `js/neurofisiologia/connectome/data/brainConnections.js`
- `js/neurofisiologia/connectome/data/brainCircuits.js`
- `js/neurofisiologia/connectome/data/brainTours.js`
- `js/neurofisiologia/connectome/data/connectomeData.js`
- `js/neurofisiologia/connectome/core/connectomeGraph.js`
- `js/neurofisiologia/connectome/core/connectomeSearch.js`
- `js/neurofisiologia/connectome/core/connectomeFilters.js`
- `js/neurofisiologia/connectome/core/connectomePathfinder.js`
- `js/neurofisiologia/connectome/core/connectomeAnalysis.js`
- `js/neurofisiologia/connectome/rendering/connectomeLayouts.js`
- `js/neurofisiologia/connectome/rendering/connectomeRenderer.js`
- `js/neurofisiologia/connectome/ui/connectomeEducation.js`
- `js/neurofisiologia/connectome/ui/connectomeController.js`
- `js/neurofisiologia/connectome/integration/connectomeQuestionBridge.js`
- `js/tests/connectome.test.mjs`
- `docs/mapa-circuitos-cerebrales-fase1.md`

### Modificados

- `laboratorio-neurofisiologia.html`
- `js/neurofisiologia/laboratorio-neurofisiologia.js`
- `js/config/appVersion.js` (`1.79` → `1.80`)

No se modifica ningun modulo fuera del Laboratorio de Neurofisiologia, salvo la fuente global de version visible. No se sobrescribe informacion manual: los cambios se agregan en archivos nuevos y puntos localizados de la pagina/entrada del laboratorio.

## Validacion

Prueba principal:

```powershell
node js/tests/connectome.test.mjs
```

Comprueba unicidad, referencias, extremos, circuitos, recorridos, jerarquia render-only, escalas de sistema y sinapsis, quimica no inferida, busqueda, filtros y capas moduladoras, pathfinder, exclusion de relaciones funcionales, seguimiento desde conexiones, aislamiento, comparacion, lesion, seis layouts, movimiento reducido, alternativa textual, contrato SOFIA, lazy loading, ARIA, temas, responsive y version.

La traza temporal `console.info("[Connectome] modulo listo", ...)` se conserva para la validacion manual solicitada; no contiene datos personales.
