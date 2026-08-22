# Interpretación de electrocardiograma en SOFÍA

## Alcance

La función ofrece una interpretación contextual y explicable de datos ECG ya documentados para el paciente seleccionado. No analiza la imagen ni la señal cruda de doce derivaciones y no genera decisiones clínicas autónomas.

## Flujo único

```text
paciente autorizado seleccionado
  → cargar expediente y subcolecciones existentes
  → identificar estudios ECG/EKG/electrocardiograma
  → extraer mediciones e informe del registro más reciente
  → calcular QTc solo con QT y frecuencia del mismo registro
  → añadir diagnósticos, comorbilidades, laboratorios y señales del motor farmacológico unificado
  → construir interpretación ECG inmutable para esa carga
  → renderizar el apartado ECG
  → compartir el mismo objeto saneado con las herramientas conversacionales de SOFÍA
```

El panel y el chat no realizan cálculos independientes.

## Capas de información

1. **Documentado:** ritmo, frecuencia, PR, QRS, QT, QTc y eje extraídos de campos estructurados o del informe.
2. **Calculado:** QTc de Bazett, Fridericia, Framingham y Hodges; Fridericia es el valor principal de presentación.
3. **Contextual:** diagnósticos/comorbilidades, electrolitos, función renal/tiroidea y señales del catálogo farmacológico existente.
4. **Faltante:** datos que no existen o no son suficientes. Un dato desconocido nunca se convierte en un resultado normal.

## Salvaguardas clínicas

- El cálculo QTc se omite si QT y frecuencia no pertenecen al mismo registro o si el informe documenta un ritmo irregular.
- Los intervalos adultos solo se aplican a pacientes de 16 años o más.
- Los límites superiores QTc usados para orientación son 470 ms para sexo masculino registrado y 480 ms para sexo femenino registrado; 500 ms activa una verificación prioritaria. Un umbral aislado no diagnostica una arritmia.
- Un QRS ancho no se clasifica como bloqueo sin morfología de las derivaciones.
- Los fármacos y comorbilidades se muestran como factores contextuales; no se les atribuye causalidad automática.
- El módulo no recomienda suspender fármacos, hospitalizar, dar de alta ni iniciar tratamiento.
- Los identificadores directos conocidos se retiran del objeto compartido con SOFÍA. El backend vuelve a sanear el contexto y valida el acceso al paciente.

## Fuentes metodológicas

El registro bibliográfico incluye los estándares AHA/ACCF/HRS de medición, conducción y QT; las declaraciones AHA/ACCF sobre torsade y arritmias inducidas por fármacos; y la guía FDA/ICH E14-S7B. Las referencias sustentan metodología y límites, pero no validan automáticamente COGNICIÓN ni un resultado individual.

## Límites actuales

- Sin trazado o señal: no analiza P, QRS, ST, T, U, ondas Q, artefactos, colocación de electrodos ni morfología de arritmias.
- Usa únicamente datos que ya existen en estudios y laboratorios autorizados del expediente.
- La cobertura farmacológica depende del catálogo unificado y conserva el estado “fuente pendiente” cuando corresponde.
- No persiste un diagnóstico ECG ni modifica el expediente.
