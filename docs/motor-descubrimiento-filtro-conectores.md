# Filtros lingüísticos del Motor de Patrones

Los resultados se clasifican una sola vez con `isFunctionWordPattern` después de recibir el análisis. Conectores y preposiciones son categorías independientes. La firma derivada se construye con `buildLexicalSignature`; `sin` está protegido y nunca se elimina.

Flujo:

```text
texto clínico
  -> normalización
  -> tokenización y extracción
  -> conteo en lotes
  -> clasificación funcional o informativa
  -> filtro de conectores
  -> filtro de preposiciones
  -> umbral de frecuencia
  -> filtros administrativos
  -> renderizado y exportación
```

Los estados predeterminados son `Excluir conectores` y `Excluir preposiciones`. Cambiarlos solo deriva firmas sobre el arreglo disponible en memoria; no vuelve a leer Firestore, tokenizar ni reconstruir el análisis. `displayPhrase` y la frase original se conservan completas.
