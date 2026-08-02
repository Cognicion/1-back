# Motor de Descubrimiento de Patrones

Primera fase: `Texto`, exclusiva del Centro de Control y visible solo para administradores. El umbral inicial es de 3 apariciones y los resultados son temporales por sesión.

## Flujo

```text
Nota clínica
  ↓ lectura administrativa en Cloud Function
Normalización (espacios, minúsculas, acentos, puntuación y exclusiones)
  ↓
Tokenización
  ↓
Extracción de palabras, bigramas, trigramas y frases de 4–20 palabras
  ↓
Filtrado de candidatos con frecuencia menor a 3
  ↓
Frecuencias, pacientes, médicos, notas, fechas y ejemplos anonimizados
  ↓
Visualización administrativa
```

## Límites de esta fase

- No usa IA, modelos predictivos, Monte Carlo ni servicios externos.
- No escribe, actualiza ni elimina documentos de Firestore.
- No muestra la sección en los paneles de médicos, psicólogos o pacientes.
- El navegador no lee expedientes ni mantiene listeners de Firestore. Los datos se solicitan mediante la callable administrativa `discoverTextPatterns` y regresan agregados.
- La configuración central es: mínimo 3 apariciones, mínimo 2 palabras, máximo 20 palabras, lotes de 25 y página de 50.
- No se usa IndexedDB, Firestore analítico ni caché local para el corpus o candidatos. Solo vive en memoria el arreglo final de patrones confirmados durante la sesión.
- Se pueden exportar únicamente resultados agregados a CSV o XLSX; nunca se exportan textos completos, nombres, teléfonos, correos o identificadores directos.
- La callable exige autenticación y rol admin desde claims o el perfil verificado en Admin SDK. Registra auditoría sin texto clínico completo.
- Las colecciones analíticas no se exponen al cliente. El repositorio no contiene las reglas Firestore existentes de la plataforma; por seguridad no se añadió un archivo incompleto que pudiera bloquear rutas clínicas. Si se crean colecciones analíticas, deben añadirse al ruleset existente con `allow read, write: if false`.

## Evolución prevista

La carpeta `js/admin/patternDiscovery/` separa controlador, indexador, tokenización, extracción, conteo, estadísticas, filtros, persistencia y renderizado. Esto permite agregar adaptadores futuros para diagnósticos, tratamientos, laboratorios, escalas, línea de tiempo, evolución clínica, práctica médica, cohortes y correlaciones sin mezclar esas responsabilidades con el análisis de texto.
