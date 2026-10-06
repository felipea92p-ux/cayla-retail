# ADR-0356 · `/chaos`: usar mal el sistema a propósito, pantalla por pantalla

- **Fecha:** 2026-10-06 · **Estado:** construido en la rama `claude/chaos-skill-resilience-testing-6010a0` (skill, catálogo, detector de
  invariantes, regla en `CLAUDE.md`, tablero). Sin migración y sin cambios en la web. **Sin probar** de punta a punta contra una pantalla real:
  la skill se escribió y sus dos scripts se probaron contra la base local, pero la primera corrida completa de `/chaos` sobre una pantalla queda
  pendiente (ver `docs/backlog/2026-10-06-chaos-skill-resilience-testing-6010a0.md`).
- **Pedido:** Felipe, 2026-10-06: «una especie de chaos monkey pero para nuestro sistema: que pase pantalla por pantalla usando de forma
  incorrecta el sistema, para hacerlo más resistente a fallos o errores de usuario». Se decidió en 10 preguntas con opciones («Ganas / Pagas»).
- **Complementa, no reemplaza:** `/flujo-de-negocio` (el camino feliz con una persona ciega), `/formidable` (si se entiende en 5 segundos),
  `/multi-view-responsive` (que el layout no se rompa). **Ninguna prueba qué pasa cuando alguien usa mal la pantalla**; ese era el hueco.

## Qué había

Las pruebas de `scripts/pruebas/` cubren la base con `ROLLBACK` (concurrencia, tokens, candados), y las de la web cubren lógica pura. Nada recorría
una pantalla de punta a punta con abusos: doble clic, recarga a mitad de un guardado, un monto con coma, dos pestañas, red cortada. Y, peor, nada
miraba la base después: un ataque casi nunca tira la pantalla, deja un estado que nadie ve (un stock que no cuadra con `movimientos`).

## Decisión

| | |
|---|---|
| **Alcance** | `/chaos <pantalla|módulo|todo>`: una pantalla, un módulo pantalla por pantalla, o `todo` que solo informa el tablero |
| **Capas** | navegador (lo que ve la persona) **y** base (RPC directo, dos sesiones paralelas para concurrencia) |
| **Elección de ataques** | **catálogo fijo + azar con semilla** (`scripts/chaos/catalogo.mjs`): el núcleo corre siempre, el azar descubre, la semilla repite |
| **Familias (8)** | entradas hostiles · doble clic y reenvío · navegación torcida · concurrencia entre cuentas · permisos y URL ajena · red y sesión · celular 375 px · teclado |
| **Gravedad** | 1 estado imposible · 2 dato malo en silencio · 3 pantalla caída · 4 error feo pero seguro; la decide la evidencia, no el ataque |
| **Invariantes** | tras cada ataque que escribe (`scripts/chaos/invariantes.mjs`): 12 que cruzan tablas y que la base no impide por sí sola |
| **Autonomía** | informa y propone; con el OK de Felipe: prueba de regresión que falla → arreglo de UNA pantalla → misma semilla otra vez |
| **Entorno** | la rama actual + la base local con `estado.mjs` (foto antes, restaurar después) |
| **Obligatoriedad** | toda pantalla o modal que guarda, con tablero (`docs/chaos/README.md`) y casilla en el PR; la parte pura, en el CI |

## Por qué así

- **Invariantes, no «no se cayó».** Solo se vigila lo que la base NO impide (`docs/datos/01-INVARIANTES.md` §2). Lo que ya impide un `check` o un
  índice único llega al ataque como un error de Postgres y listo. Una prueba lo exige: no hay `cantidad < 0` ni «dos cajas abiertas» en la batería.
- **El detector se prueba a sí mismo** (`--autoprueba`): corrompe el dato dentro de una transacción que SIEMPRE se revierte y exige que el
  detector grite. Un detector que siempre dice «limpio» es peor que ninguno. Si no se puede corromper (el libro `movimientos` es inmutable a
  propósito, dos disparadores `ENABLE ALWAYS`), lo dice en voz alta; **nunca cuenta como aprobada**. Hoy: 9 de 12 comprobadas y vivas.
- **Foto de violaciones antes/después** (`--guardar` / `--contra`): el seed y la historia traen violaciones propias; solo cuenta lo que el ataque
  rompió. Un `error` al evaluar no es «limpia» ni «violación»: queda `error`.
- **Catálogo como datos**, no prosa: se puede filtrar por lo que tiene la pantalla (`--aplica`), sortear con semilla, comprobar contra las
  invariantes que existen y probar que cubre las 8 familias. Un ataque de gravedad 1 que escribe debe decir qué invariantes mirar (lo exige la
  prueba).
- **Hallazgos de seguridad fuera del repo.** El repo es público: la familia `permisos` solo comprueba que los candados que CAYLA ya declaró
  (ADR-0126, 0161, 0178) aguantan, y su detalle va al chat y a `.chaos/`, nunca al tablero ni al ADR. No es un escáner de vulnerabilidades.

## Alternativas descartadas

- **Solo la capa de base** (rápido y determinista): no ve botones que se pulsan dos veces ni errores de pantalla.
- **Solo azar** (chaos monkey puro): difícil de comparar y fácil de olvidar un caso básico; sin semilla, un hallazgo no se puede repetir.
- **Espejo congelado de `main`** (como `/flujo-de-negocio`): no sirve para probar una pantalla aún sin fusionar, que es cuando más hace falta.
- **Arreglar lo claro sin esperar:** choca con la regla de confirmar antes de tocar más de un módulo y con que dinero y stock sean de Felipe.
- **Una prueba de CI que obligue** (como `lib/guia-de-foco.test.ts`): segunda etapa. Hoy «obligatoria» es regla de `CLAUDE.md`, tablero y casilla del PR;
  en el CI solo corre la parte pura. Escribir «obligatoria» sin la prueba es, honestamente, una costumbre: queda anotado como pendiente.

## Riesgos y lo que no cubre

- **La base local es compartida.** Restaurar con `estado.mjs` deshace también lo que escribió otra sesión. El 2026-10-06 apareció un movimiento
  ajeno (otro usuario) mientras se probaba el detector. Por eso la skill no corre si hay escrituras de menos de 10 minutos y para si, al restaurar,
  cambia una tabla que ningún ataque tocó.
- **Dos cuentas a la vez no se hace con dos pestañas** (comparten cookies): la concurrencia va por la base (dos sesiones `psql`) o se declara
  «no cubierto». Es un hueco real del navegador integrado.
- **Un hallazgo existente al escribir:** `INV-10` ve 3 movimientos de traslado del 2026-10-03 sin `usuario_id` en la base local. Es historia, no
  un ataque; queda en el backlog para investigar qué función los firmó mal.
- **El seed local es chico:** volumen, nombres largos reales y carga no se prueban.

## Archivos

`.claude/skills/chaos/SKILL.md` · `scripts/chaos/invariantes.mjs` (+ `.test.mjs`) · `scripts/chaos/catalogo.mjs` (+ `.test.mjs`) ·
`docs/chaos/README.md` · `CLAUDE.md` «Caos» · `.github/pull_request_template.md` · `.github/workflows/ci.yml` (paso «Catálogo de caos e invariantes»).
