# SOFIA

SOFIA significa Sistema de Operacion para Funciones Inteligentes y Aprendizaje.

Esta carpeta contiene solo el esqueleto arquitectonico inicial. No modifica el sistema clinico existente, no usa Firebase, no usa autenticacion y no conecta modelos de IA todavia.

## Flujo cognitivo preparado

Entrada -> Percepcion -> Atencion -> Espacio de Trabajo Global -> Control Ejecutivo -> Objetivos -> Razonamiento -> Planificacion -> Toma de Decisiones -> Motor de Inferencia -> Interaccion -> Aprendizaje -> Memoria.

Interaccion y Aprendizaje quedan como puntos de extension futuros.

## Principios

- Alta cohesion.
- Bajo acoplamiento.
- Contratos publicos claros.
- Comunicacion por eventos o interfaces.
- Independencia de proveedores de IA.
- Preparado para OpenAI, Gemini, Claude, Ollama, modelos locales o APIs propias.

## Estado actual

Cada modulo expone:

- entradas()
- procesar()
- obtenerEstado()
- reiniciar()
- configurar()

La implementacion actual es neutral y estructural. Las capas de razonamiento, memoria, inferencia y aprendizaje se implementaran en etapas posteriores.
