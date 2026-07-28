# Historia Clínica 0.1.7

## Flujo corregido

Paciente seleccionado → carga única de `usuarios/{uid}/historiaClinica/historiaInicial` → normalización en memoria → renderizado de Historia Clínica, hitos y familiograma → edición local → validación no destructiva → sanitización → `setDoc` con `merge:true` → actualización compatible del perfil y auditoría.

La vista completa reutiliza las mismas secciones y controles; no crea formularios, listeners ni consultas duplicadas.

## Modelo añadido

```js
antecedentesPerinatales: "",
hitosDesarrollo: {
  registros: [{ hitoId, estado, edad: { valor, unidad, desconocida }, observaciones }],
  observacionesGenerales: ""
},
familiograma: {
  personas: [{ id, nombre, parentesco, sexo, edad, fallecido, convive, pacienteIdentificado, antecedentes }],
  relaciones: [{ id, personaA, personaB, tipo, calidad }],
  observacionesGenerales: ""
},
exploracionMental: ""
```

La exploración mental antigua se compone en memoria desde sus campos estructurados y se conserva en Firestore por `merge`; no se hace migración destructiva. Los documentos antiguos sin los nuevos campos reciben valores seguros únicamente en memoria.

## Archivos

- `js/data/catalogoHitosDesarrollo.js`: fuente única del catálogo.
- `js/components/hitosDesarrolloHistoria.js`: selección, acordeones, filtros y normalización local.
- `js/components/familiogramaHistoria.js`: editor SVG, relaciones, alternativa textual y controles de vista.
- `historia.html`, `js/historia.js`, `css/historia.css`: integración, navegación y estilos responsivos.
- `login.html`, `service-worker.js`, `js/services/cacheControlService.js`: versión 0.1.7 y caché.

No se localizaron módulos separados de PDF/Word para Historia Clínica: la exportación existente usa `window.print()`, y la vista de impresión ya muestra todas las secciones. No se cambiaron reglas de Firestore ni se añadieron consultas.

## Validación realizada

Se comprobó sintaxis de los módulos nuevos y del controlador principal con `node --check`, y `git diff --check`. La validación visual completa, persistencia real Firestore, impresión, móvil y permisos requieren ejecución manual en la aplicación con usuarios y datos de prueba; los logs técnicos agrupados bajo `[HistoriaClinica]`, `[HistoriaClinica:Hitos]`, `[HistoriaClinica:Familiograma]` y `[HistoriaClinica:Vista]` quedan disponibles para esa validación y no incluyen contenido clínico.
