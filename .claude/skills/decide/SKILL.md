---
name: decide
description: Fuerza el protocolo de pregunta de CLAUDE.md sobre una decisión abierta puntual, con hasta 3 opciones comparadas (Ganas/Pagas) y una recomendación. En las decisiones estructurales suma una voz independiente (un escéptico con contexto limpio) y deja el disenso a la vista.
---

Aplica la sección AUTONOMÍA de `~/.claude/CLAUDE.md` (global) sobre: $ARGUMENTS

Antes de preguntar, pasa este test y dile a Felipe en 1 línea si lo pasó o no:
1. ¿La respuesta no vive en el repo, el schema, los ADRs (`/docs/adr/`) ni
   el backlog (`/docs/backlog/` y `/docs/BACKLOG.md`)?
2. ¿Elegir mal cuesta más que deshacerlo en menos de 30 minutos?
3. ¿Depende de cómo opera CAYLA, no de cómo funciona Postgres/Next.js?

Si NO lo pasó: no preguntes — cae en "ejecuto sin preguntar". Decide, ejecuta, y
explica en 3 líneas (QUÉ HICE/POR QUÉ ASÍ/QUÉ SE ROMPERÍA SIN ESTO) por qué esto no
era una pregunta para Felipe.

Si SÍ lo pasó: usa el formato exacto de "propongo y espero aprobación" (máx. 3
opciones, cada una con Ganas/Pagas y un ejemplo real de CAYLA, nunca `foo`/`bar`),
termina con tu recomendación y "si no respondes, ejecuto [X]".

## Una voz independiente, solo en las decisiones estructurales

Si la decisión es **estructural** (cambia el modelo de datos, una regla de `CLAUDE.md`, un ADR, algo que toca más de un módulo,
o dinero, stock, permisos o SUNAT), antes de escribir las opciones haz esto. En una decisión chica, no: tres voces para algo que
se deshace en 30 minutos es gasto.

1. **Tu posición primero, por escrito y antes de mirar nada más:** qué recomiendas, tus tres razones más fuertes y el riesgo
   principal de tu camino. Así el resultado no termina copiando a la otra voz.
2. **Un escéptico con contexto limpio** (un subagente nuevo, no un fork): recibe **solo la pregunta** y los datos mínimos que la
   hacen entendible (archivos, cifras, restricciones), sin tu posición ni la conversación. Su encargo: cuestionar cómo está
   planteada la pregunta, nombrar la alternativa más simple que sea creíble y el riesgo que nadie está mirando. Que responda en
   menos de 300 palabras con: posición, tres razones, riesgo y una cosa que los demás no verían.
3. **Junta sin esconder:**
   - No descartes lo que dijo el escéptico sin decir por qué.
   - Si te hizo cambiar de recomendación, dilo.
   - Muéstrale a Felipe el disenso más fuerte aunque lo rechaces, en una línea propia: «El escéptico propone…; no lo recomiendo
     porque…».
   - Antes de las opciones, dos líneas: tu posición inicial y la del escéptico.

Viene de la skill `council` del repo affaan-m/ecc (pasos 3 a 5), sin su consejo de cuatro voces: aquí basta una, porque
`grilling` ya interroga a Felipe y el escéptico de `/revision` cubre las revisiones grandes.
