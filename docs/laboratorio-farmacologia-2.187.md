# Laboratorio de farmacología · entrega local 2.187

Fecha: 2026-09-04. Versión visible: **2.186 → 2.187**.

## Cambios terminados

- Presentación continua del laboratorio: se retiraron fondos, contornos cerrados, sombras y esquinas de tarjeta en paciente, medicamentos, parámetros, resumen y alertas. Se conservaron controles de entrada y separadores de tabla. Fondo biocelular atenuado.
- El selector del Panel médico respeta su estado cerrado, por lo que deja de reservar espacio cuando no se está utilizando.
- El ejemplo sano carga 12 resultados, peso de 62 kg, talla de 168 cm e IMC de 21.97 kg/m². Los resultados pertenecen a una muestra ficticia fechada el 2026-09-04. La relación A/G derivada es 1.4.
- Se mantienen estudios desplegables, unidades simbólicas e intervalos orientativos editables mediante lápiz. Globulinas tiene un resultado de ejemplo de 3 g/dL y conserva el intervalo vacío por depender del método/laboratorio; no se etiqueta como normal sin referencia.
- Peso y talla del expediente se integran desde los campos existentes. La talla en metros se convierte a centímetros para el formulario. El IMC se calcula con la utilidad central que ya usa el expediente.
- El motor común considera el IMC elevado en adultos para una precaución de vigilancia cuando el medicamento tiene una señal metabólica/glucémica local. No introduce un diagnóstico confirmado, una contraindicación absoluta ni un ajuste automático de dosis a partir del IMC.
- La evaluación se actualiza al editar edad, peso o talla. Vaciar una medida en la simulación no recupera silenciosamente el dato importado.
- Al cambiar de ejemplo a expediente se limpian unidades, intervalos editados y fecha de la simulación previa. La prueba de navegador reprodujo y verificó la corrección de la fecha ficticia que antes se conservaba.

## Integración y esquema

El catálogo normalizado permanece en `js/data/catalogoFarmacologicoUnificado.js`; los parámetros se resuelven mediante `js/services/parametrosClinicosPaciente.js` y las alertas mediante `js/services/motorClinicoMedicamentos.js`.

Se reutilizan los campos existentes `peso`, `talla`, `somatometria`, `signosVitales` y `datosInstitucionales`. La simulación es una copia local. No se cambiaron esquemas, permisos, rutas o persistencia de Firebase.

Los cambios en los demás puntos de entrada son actualizaciones de caché para que expediente, alta de paciente, SOFÍA/ECG y consulta pública reciban el mismo motor actualizado.

## Fuente y cobertura farmacológica vigente

La fuente Stahl permanece en `fuentes_farmacologicas/stahl_prescribers_guide.pdf`. Se confirmó que el PDF tiene 894 páginas y que la página PDF 545, correspondiente a olanzapina, tiene texto extraíble (3492 caracteres); esa página no requiere OCR. Se conserva la trazabilidad existente por monografía, secciones y páginas.

Los conteos proceden de `COBERTURA_FARMACOLOGICA`; no representan nuevas monografías completadas en esta entrega:

| Estado | Medicamentos |
| --- | ---: |
| Normalizados | 374 |
| Fuente verificada local | 72 |
| Fuente regulatoria parcial | 84 |
| Fuente pendiente estricta | 218 |
| Fichas completas frente al esquema mínimo | 1 |

El contador legado `fuentePendiente = 302` reúne las 84 fuentes regulatorias parciales y las 218 pendientes estrictas. Fuente verificada y ficha completa son conceptos diferentes.

Para la clasificación antropométrica se consultó [OMS: sobrepeso y obesidad](https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight). La nueva precaución se identifica como regla local de vigilancia, no como escala validada de riesgo, e incluye la fuente de los medicamentos implicados.

## Verificación

Resultado: **73 pruebas automatizadas + 1 prueba de navegador aprobadas**, sin fallos ni pruebas omitidas en estas ejecuciones.

- Olanzapina + risperidona con hipertensión: aprobadas vidas medias específicas, metabolismo, metabolito activo de risperidona, duplicidades, alertas diagnósticas y cargas aditivas.
- Metilfenidato + atomoxetina con hipertensión: aprobada la precaución cardiovascular y ausencia de puntuaciones ambiguas de presión.
- No psiquiátricos: enalapril + losartán participan en la regla de bloqueo dual del SRAA; caso con captopril repetido también aprobado.
- Cólera + furosemida: se mantiene la precaución alta por deshidratación y alteraciones hidroelectrolíticas, con fuentes CDC/DailyMed; no se convierte en contraindicación absoluta.
- Peso/talla: misma alerta con centímetros, metros y coma decimal; equivalencia entre adaptador del expediente y motor; no clasificación adulta en menores, embarazo conocido, edad ausente o medidas incompletas.
- Navegador Chrome: los 12 resultados se cargan realmente, el lápiz edita el intervalo y cambia la clasificación, los ejemplos se reemplazan correctamente, la integración importa peso/talla y el borrado local se respeta.
- Diseño: estilos calculados sin tarjetas en temas biocelular, oscuro y claro; comprobación móvil de 390 px sin desbordamiento horizontal de la página. Las tablas conservan desplazamiento horizontal interno.
- Validador de diagnósticos: 4456 entidades, sin duplicados ni paneles vacíos; versión 2.187.
- `git diff --check`: aprobado.

La prueba de navegador utiliza el HTML, CSS, formulario y motor reales con respuestas Firebase ficticias. No accede a pacientes reales ni valida permisos de una sesión real.

Ejecutar las comprobaciones de lógica:

```powershell
node --test tests/parametros-clinicos-paciente.test.mjs tests/farmacologia-parametros-integracion.test.mjs tests/laboratorio-farmacologia-parametros-ui.test.mjs tests/paciente-parametros-integracion.test.mjs js/tests/motorClinicoMedicamentos.test.mjs js/tests/catalogoFarmacologicoUnificado.test.mjs js/tests/pacienteEntrypointSyntax.test.mjs js/tests/laboratorioFarmacologiaStahl.test.mjs js/tests/laboratorioFarmacologiaInteracciones.test.mjs js/tests/interaccionesPublicas.test.mjs tests/sofia-ecg-static.test.mjs
node scripts/validar-catalogo-diagnosticos.mjs
```

Para el navegador, instalar/disponer de Playwright y Chrome. Si Playwright no está en la resolución normal de Node, indicar su directorio en `PLAYWRIGHT_MODULE_PATH`. Ejecutar `node --test tests/laboratorio-farmacologia-browser.test.mjs`. Opcionalmente, `FARMACO_QA_SCREENSHOTS` define el directorio de capturas. Sin Playwright esa prueba se omite explícitamente.

## Límites que siguen vigentes

La base no garantiza cobertura exhaustiva de todas las combinaciones. Las fuentes y reglas ausentes siguen declaradas como pendientes. Los rangos adultos no sustituyen el intervalo del laboratorio. La nueva precaución por IMC requiere valoración clínica y no cubre por sí misma dosificación por kg, ajuste por composición corporal ni clasificación pediátrica.

Para ampliar fuentes no psiquiátricas, continuar con fichas regulatorias por producto y presentación de DailyMed/FDA y AEMPS-CIMA, registrando fecha, sección y enlace específicos.

## Archivos de esta entrega

- `css/laboratorio-farmacologia.css`
- `index.html`
- `js/config/appVersion.js`
- `js/data/interaccionesFarmacologicas.js`
- `js/laboratorio-farmacologia.js`
- `js/nuevoPaciente.js`
- `js/paciente.js`
- `js/public/interaccionesFarmacologicasPublicas.js`
- `js/services/interaccionesPublicas.js`
- `js/services/motorClinicoMedicamentos.js`
- `js/services/sofiaClinica.js`
- `js/services/sofiaElectrocardiograma.js`
- `js/sofia.js`
- `js/tests/pacienteEntrypointSyntax.test.mjs`
- `laboratorio-farmacologia.html`
- `nuevo-paciente.html`
- `paciente.html`
- `scripts/validar-catalogo-diagnosticos.mjs`
- `sofia.html`
- `tests/apuntes-rich-editor.test.mjs`
- `tests/farmacologia-parametros-integracion.test.mjs`
- `tests/sofia-ecg-static.test.mjs`
- `tests/laboratorio-farmacologia-browser.test.mjs`
- `docs/laboratorio-farmacologia-2.187.md` (este informe)

## Estado Git

Trabajo exclusivo en el repositorio canónico `D:\Escritorio\PROYECTO COGNICION\1-back`, rama `main`. Al cierre, `main...origin/main` registra **0 commits adelante y 0 atrás** respecto de la referencia local disponible. Los cambios quedan sin commit y sin publicar. No se verificó producción como si esta versión estuviera desplegada.

