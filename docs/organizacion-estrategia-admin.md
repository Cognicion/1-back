# Organización y estrategia — Centro de Control

Versión inicial: 2.212 (2026-09-12).

## Alcance implementado

El módulo se carga exclusivamente después de que un administrador abre `Centro de Control → Organización`. La validación de acceso ocurre primero en el arranque administrativo y vuelve a aplicarse en Firestore Rules.

Vistas disponibles:

- Resumen con métricas explicables, alertas e insights deterministas.
- Mapa ligero de personas, áreas, proyectos, productos y oportunidades.
- Equipo, áreas, responsabilidades RACI, proyectos, expansión, talento, riesgos, objetivos, decisiones, historial y simulador.
- Catálogos complementarios de roles, capacidades, productos, líneas de negocio, hipótesis y alianzas.
- Búsqueda transversal y exportación JSON/CSV sin la colección sensible.

No se incluyen datos reales precargados. La acción opcional “Crear estructura inicial” exige confirmación y solo crea áreas sugeridas en estado `Planeada`/`Descubierta`.

## Flujo de datos

```text
Firestore organizations/{organizationId}
  → organization-service (lectura, escritura, archivado, auditoría)
  → OrganizationApp (estado único de la sesión)
  → organization-metrics (funciones puras)
  → vistas y componentes reutilizables
```

Las 16 subcolecciones ordinarias se leen en paralelo una sola vez por carga o actualización manual. No se crea un listener por tarjeta. Mapa, historial, matrices y simulador se renderizan solo cuando se abre su vista.

## Esquema Firestore

Raíz actual: `organizations/cognicion-labs`.

Subcolecciones:

- `members`
- `areas`
- `roles`
- `assignments`
- `projects`
- `products`
- `opportunities`
- `talentNeeds`
- `risks`
- `objectives`
- `decisions`
- `alliances`
- `capabilities`
- `businessLines`
- `hypotheses`
- `organizationEvents`

Las relaciones usan IDs lógicos (`ownerId`, `personId`, `areaId`, `projectId`, etc.). Los registros conservan metadatos de creación/actualización y se archivan en vez de borrarse físicamente.

`privateRecords` se reserva para participación accionaria, aportaciones, vesting, salarios, compensaciones y conflictos societarios. Firestore exige además `usuarios/{uid}.permisosOrganizacion.sensitive == true`; el rol admin por sí solo no permite leerla. La interfaz inicial no captura estos campos.

## Métricas

- **Cobertura:** `(áreas cubiertas + 0.5 × áreas parciales) / áreas activas × 100`. Requiere al menos un área; de lo contrario muestra “No evaluada”. Una cobertura completa requiere responsable y backup.
- **Bus Factor mínimo:** menor cantidad de personas únicas asociadas a una función o capacidad evaluada. Se etiqueta como aproximado.
- **Riesgo de conocimiento:** funciones/capacidades con Bus Factor 1; se eleva riesgo documental cuando además la documentación no figura como completa.
- **Carga:** indicador administrativo: responsabilidades + `1.5 × proyectos activos + 1.5 × responsabilidades críticas`; también respeta carga declarada `Saturada` y porcentajes >100. No se presenta como conclusión laboral.
- **Readiness:** gates completos / total de gates. Sin checklist muestra “No evaluada”.
- **Score de oportunidad:** ponderación visible de impacto, ingresos potenciales, sinergia, escalabilidad, readiness, urgencia, esfuerzo y complejidades. Se marca explícitamente como heurístico.
- **Severidad de matriz de riesgos:** producto de probabilidad 1–5 por impacto 1–5.

## Seguridad y privacidad

- Lectura/escritura ordinaria: `isAdmin()` en Firestore Rules.
- Borrado físico: denegado. El cliente usa soft-delete/archivado.
- Datos sensibles: colección separada y permiso granular adicional.
- No se usan `localStorage` ni variables globales como fuente de verdad.
- No se incorporaron Cloud Functions: no hay operación privilegiada que las necesite en esta fase.
- Exportación JSON excluye explícitamente `privateRecords`.

## Simulador

Los escenarios se calculan sobre una clonación en memoria. “Convertir simulación en plan” abre un formulario editable; nunca escribe automáticamente. La persistencia sigue requiriendo que el administrador pulse Guardar.

## Validación

```powershell
node --test tests/organization-metrics.test.mjs tests/organization-admin-static.test.mjs
firebase emulators:exec --only firestore --project cognicion-57052 "node --test functions/test/emulator/organizationRules.test.mjs"
```

La segunda orden requiere JDK 21 o posterior por exigencia de Firebase CLI 15.22.4.

## Pendientes de fases posteriores

- Arrastre y paneo libre del grafo; la versión inicial ofrece zoom, filtros, búsqueda y edición desde nodos.
- Importador masivo y exportación con selección granular de campos.
- Adaptador de contexto para SOFÍA, deliberadamente desacoplado hasta definir el contrato autorizado.
- Operaciones societarias sensibles y su interfaz, deliberadamente desactivadas.
- Snapshots periódicos opcionales; la versión inicial usa eventos compactos.
- Validación con emulador en este equipo cuando esté disponible JDK 21+.
