# Filtro de conectores del Motor de Patrones

Los resultados se clasifican una sola vez con `isFunctionWordPattern` después de recibir el análisis. La clasificación marca como funcional únicamente una frase cuyos tokens pertenecen todos al conjunto español de palabras funcionales.

Flujo:

```text
texto clínico
  -> normalización
  -> tokenización y extracción
  -> conteo en lotes
  -> clasificación funcional o informativa
  -> filtro de conectores
  -> umbral de frecuencia
  -> filtros administrativos
  -> renderizado y exportación
```

El estado predeterminado es `Excluir conectores`. Cambiarlo solo filtra el arreglo disponible en memoria; no vuelve a leer Firestore, tokenizar ni reconstruir el análisis. Las frases clínicas que contienen conectores se conservan completas.
