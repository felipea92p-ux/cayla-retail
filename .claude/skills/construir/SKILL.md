---
name: construir
description: Ejecuta una construcción grande (pantalla nueva, módulo, migración con RPC+UI) actividad por actividad — cada una un corte vertical verificable con su propio commit, sin desviarse a nada fuera de esa actividad. Úsala para trabajo multi-paso que normalmente se dispersa; no la uses para un fix o ajuste de un solo archivo.
---

Construye $ARGUMENTS con este protocolo. Objetivo: cortar el divagar, no añadir ceremonial.

## 0. Apuesta el alcance antes de tocar código

Arma la lista COMPLETA de actividades. Cada actividad es un corte vertical demostrable
de punta a punta (ej. "registrar un traslado" = esquema + RPC + pantalla + prueba) —
nunca una capa sola ("todo el esquema" no es una actividad, es un tercio de varias).
Ordénalas por dependencia técnica primero, valor de negocio como criterio de empate.

Preséntala como lista numerada corta — una línea por actividad, qué queda demostrable
al cerrarla — y espera aprobación o ajuste explícito de Felipe antes de escribir una
sola línea de código. Esta es la única pausa dura de todo el flujo.

## 1. Por cada actividad aprobada, en orden, sin adelantarte a la siguiente

a. Anuncia en una línea qué vas a hacer y cómo la vas a verificar (comando, prueba,
   o pantalla en el navegador — nunca "debería funcionar").
b. Constrúyela completa. Cero excepciones: ningún refactor "ya que estoy aquí",
   ninguna mejora oportunista, ningún archivo fuera de lo que esa actividad necesita
   — aunque sea de 2 líneas y obvio. Eso es exactamente el divagar que esta skill
   corta.
c. Verifícala con evidencia real, no narrada: corre el comando/prueba, o abre el
   navegador (`preview_start`) si es pantalla, y aplica lo que corresponda de
   "ANTES DE DECIR LISTO" del `CLAUDE.md` del proyecto (concurrencia, caída externa,
   persona sin contexto) cuando la actividad los toque.
d. Un commit por actividad (Conventional Commits, scope del dominio real) — nunca
   mezclado con la siguiente.
e. Reporta las 3 líneas de siempre (QUÉ HICE / POR QUÉ ASÍ / QUÉ SE ROMPERÍA SIN
   ESTO) y pasa a la siguiente.

## 2. Si algo FUERA de la actividad actual la bloquea

No inventes una regla nueva — aplica el test de `/decide`: ¿vive ya en el repo, el
schema, los ADRs o el backlog? ¿cuesta más que deshacerlo mal en <30 min? ¿es de cómo
opera CAYLA y no de Postgres/Next.js? Si pasa el test, detente y pregunta con
Ganas/Pagas + recomendación + "si no respondes, ejecuto [X]". Si no lo pasa,
resuélvelo, sigue, y dilo en el reporte de esa actividad.

## 3. Si algo NO bloquea pero vale la pena arreglar

Deuda técnica, bug chico, mejora obvia fuera de la actividad: no lo toques. Un
`spawn_task` con archivo:línea exacto, y sigues. Nunca lo dejes solo mencionado en el
reporte — ahí se pierde.

## 4. Si la LISTA completa resulta estar mal, no solo la actividad

Falta una actividad, el orden no sirve, una actividad era en realidad dos: detente
del todo, explica por qué, y repropón la lista completa. No lo resuelvas reordenando
en silencio ni sigas por inercia con un plan que ya sabes que está mal.

## 5. Al cerrar la última actividad de la lista

El ritual de sesión normal del repo: bitácora/backlog del día, ADR si hubo alguna
decisión estructural en el camino.
