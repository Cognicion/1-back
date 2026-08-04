# Assets de SOFÍA Mascota

La primera versión usa un fallback visual pixel-art construido con CSS/DOM, por lo que no solicita sprites ni muestra imágenes rotas. No hay assets raster pendientes de carga en esta versión.

Si se incorporan sprites posteriormente, deben conservar el contrato de estados: `idle`, `listening`, `thinking`, `reading`, `pattern-detection`, `success`, `warning`, `error` y `sleeping`. El fallback debe permanecer disponible ante cualquier error de carga.
