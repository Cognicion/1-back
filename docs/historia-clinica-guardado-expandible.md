# Historia Clínica: guardado, campos ampliables y ginecoobstetricia

## Diagnóstico del guardado

El botón de `historia.html` ejecuta `window.guardarHistoria()`. El flujo leía los campos, llamaba a `guardarHistoriaClinica()` en `usuarios/{uid}/historiaClinica/historiaInicial`, actualizaba el documento del paciente y registraba auditoría.

La causa real del mensaje genérico era una reasignación inválida posterior a la escritura: dentro de `guardarHistoria()` se declaraba `const pacienteActual` y después se intentaba reasignar ese mismo identificador para confirmar la persistencia del peso. El `TypeError` ocurría después de guardar la historia, por lo que el usuario podía recibir un error aunque la primera escritura ya hubiera terminado. Además, la auditoría se ejecutaba dentro del mismo `try` y un fallo aislado de auditoría podía presentarse como fallo de guardado.

La variable local ahora se llama `pacienteDatosActuales`, la confirmación actualiza el estado global sin colisión y la auditoría se registra de forma aislada. Un fallo de auditoría queda trazado técnicamente sin borrar ni invalidar la historia ya guardada.

## Flujo corregido

Click → validación de paciente → lectura del formulario → normalización de medidas y sustancias → sanitización recursiva → escritura con `merge: true` → actualización compatible del paciente → confirmación de persistencia → auditoría aislada → estado `Guardado`.

En error, el formulario permanece intacto, el botón se rehabilita y se conserva la etapa técnica en `[HistoriaClinica:Guardar]` sin registrar contenido clínico.

## Sanitización

`sanitizarDatosHistoriaClinica()` elimina `undefined`, funciones y nodos DOM; normaliza `NaN` e invalid dates a `null`; conserva `false`, `0`, cadenas vacías, arreglos vacíos y tipos compatibles de Firebase sin mutar el objeto original.

## Campos ampliables

La lógica compartida está en `js/components/redimensionadorCampos.js`. Nota la consume mediante la misma configuración de controles que ya tenía, y Historia Clínica la utiliza para todos sus `textarea`, incluidos los bloques dinámicos de sustancias. Se mantienen contraer, expandir, reiniciar, ajuste táctil, Escape/teclado de la página y límites de altura existentes de Nota.

## Antecedentes ginecoobstétricos

Se agregó `antecedentesGinecoobstetricos` dentro de Antecedentes. La visibilidad se determina mediante `sexo`, con respaldo en `datosInstitucionales.sexo`, `sexoBiologico` y `genero`, centralizado en `js/utils/sexo.js`. Las historias antiguas reciben `""` en memoria. Si existe contenido guardado y el sexo actual no corresponde, el bloque permanece visible con aviso y nunca se elimina automáticamente.
