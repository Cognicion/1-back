# Motor de Descubrimiento de Patrones

Primera fase: `Texto`, exclusiva del Centro de Control y visible solo para administradores.

## Flujo

```text
Nota clínica
  ↓ lectura de colecciones compatibles
Normalización (espacios, minúsculas, acentos, puntuación y exclusiones)
  ↓
Tokenización
  ↓
Extracción de palabras, bigramas, trigramas y frases de 4–20 palabras
  ↓
Actualización incremental del índice local por firma de nota
  ↓
Frecuencias, pacientes, médicos, notas, fechas y ejemplos anonimizados
  ↓
Visualización administrativa
```

## Límites de esta fase

- No usa IA, modelos predictivos, Monte Carlo ni servicios externos.
- No escribe, actualiza ni elimina documentos de Firestore.
- No muestra la sección en los paneles de médicos, psicólogos o pacientes.
- El índice se conserva en `localStorage` del navegador del administrador. Una firma evita reprocesar una nota que no cambió; la primera lectura recorre las rutas compatibles para crear el inventario inicial.
- Las colecciones soportadas son `usuarios/*/{notasMedicas,notas,notasClinicas,notasRapidas,historiaClinica}` y sus equivalentes bajo `pacientes`.

## Evolución prevista

La carpeta `js/admin/patternDiscovery/` separa controlador, indexador, tokenización, extracción, conteo, estadísticas, filtros, persistencia y renderizado. Esto permite agregar adaptadores futuros para diagnósticos, tratamientos, laboratorios, escalas, línea de tiempo, evolución clínica, práctica médica, cohortes y correlaciones sin mezclar esas responsabilidades con el análisis de texto.
