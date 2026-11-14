---
name: innovar
description: Busca oportunidades de INNOVACIÓN en algo nuevo o ya hecho del ERP de CAYLA (una pantalla, un módulo, una tabla o RPC, lo que cambió en la rama, o todo), comparándolo contra lo mejor y lo más nuevo del mundo — el qué de los líderes de retail y ERP (Shopify POS, Square, Lightspeed, Odoo, NetSuite) y el cómo del software de primer nivel (Linear, Stripe, Vercel, Apple) — y contra lo último del stack (Next, React, Postgres, Supabase, Vercel), leído del radar curado `docs/radar/`. Mira cuatro frentes con agentes en paralelo (producto y experiencia, arquitectura y código, base y reglas, operación y calidad), un escéptico descarta lo falso, la moda y lo que no es para 3 tiendas + 1 taller, y entrega TODAS las propuestas separadas en «ahora» y «visión», con las 3 primeras de cada grupo al frente y todo guardado en el tablero `docs/innovacion/`. Solo propone: construye con el OK de Felipe. No repite a /formidable, /milimetro, /chaos, /rigor ni /revision: les deriva lo suyo. Úsala cuando Felipe diga «innovar», «qué haríamos mejor», «qué hacen los mejores», «qué hay de nuevo», «oportunidades de mejora» o «está al día esto», al terminar algo nuevo o para auditar lo ya hecho. Modos `rapido` y `profundo`; con `radar`, refresca el radar.
---

Busca innovación en: $ARGUMENTS
(una ruta `/vender`, un módulo `inventario`, una tabla o RPC `registrar_venta`, `rama` = lo que cambió frente a `main`, `todo`; sin argumento = lo que
estás construyendo. Modo: `rapido` · normal (por defecto) · `profundo`. `radar` = refrescar `docs/radar/` y nada más.)

**Para qué existe, en una frase:** que CAYLA no se quede en «funciona y está bien hecho», sino que cada pieza se compare con cómo la resuelven
hoy los mejores del mundo y con lo que el stack ya permite, y que esas ideas no se pierdan en un chat. Pedido de Felipe, 2026-11-13: «encontrar
oportunidades de mejora en cualquier cosa nueva que se crea, e incluso auditar lo que ya está hecho, siempre innovando con lo más top y lo
último en desarrollo de sistemas». Decisiones y porqué: `docs/adr/0651-innovar-skill-de-innovacion.md`.

## Candados (no se negocian)

1. **Propone, no toca.** Lo único que escribe sin preguntar es su informe y el tablero (`docs/innovacion/`). Construir es un paso aparte, con el OK
   de Felipe, en la misma sesión (paso 6).
2. **Dinero y precios, stock y movimientos, permisos y roles, comprobantes y SUNAT esperan SIEMPRE el OK de Felipe**, aunque la propuesta sea
   pequeña (CLAUDE.md «Reglas de ejecución»). Se marcan `toca_lo_delicado: true`.
3. **Solo innovación.** Si lo que encuentra es de otra skill, no lo desarrolla: lo **deriva** en una línea («esto es de `/chaos`: doble clic en
   Cobrar»). Tabla de derivación: `referencia/miradas.md` § «No es nuestro».
4. **Moderno sin moda** (ultra-criterio, regla 10). Una idea entra solo si resuelve un problema real de CAYLA, con su escenario de negocio; «lo
   usa Linear» no es un motivo. Se diseña para el volumen que viene (principio 5): 3 tiendas + 1 taller, no Zara.
5. **Sin fuente no hay referente.** Cada propuesta cita al menos un referente o una novedad del stack, con URL y fecha. Lo que se sabe de memoria
   y no tiene fuente se marca «sin fuente verificada» y baja su confianza.
6. **Las decisiones de Felipe se respetan.** Si una idea choca con un ADR o una regla de CLAUDE.md (el vidrio, el loader único, «nada optimista
   en dinero»), no se esconde ni se aplica: va como **propuesta de cambio de regla**, con el ADR que cambiaría, y la decide Felipe.
7. **El repo es público.** Una idea que describe un hueco de seguridad abierto no entra a un archivo versionado: se la dices a Felipe en el chat.
   Las búsquedas web nunca llevan datos de CAYLA, nombres de personas ni cifras del negocio.

## Paso 0 — Terreno (tú, el coordinador)

1. `git fetch origin` y `git rev-list --left-right --count HEAD...origin/main`; anota `git rev-parse --short origin/main`. Si la rama va detrás,
   los agentes leen con `git show origin/main:<ruta>`.
2. Lo que ya está en vuelo: `docs/SESIONES-ACTIVAS.md` (tabla «Activas ahora») y `gh pr list --state open --limit 60`.
3. **Lo que ya se propuso:** `docs/innovacion/README.md`. Nada que esté `descartada` vuelve, salvo que el motivo del descarte ya no sea cierto
   (y se dice cuál cambió). Lo que está `propuesta` o `aceptada` no se repite: se cita su id.
4. **El radar:** lee la fecha de `docs/radar/README.md`. Con más de 14 días (la rutina semanal faltó dos veces), dilo en la primera línea del informe y ofrece `/innovar radar` al final;
   en modo `profundo`, refréscalo antes de seguir (sección «Modo radar»).
5. **Qué es lo que se audita y qué problema resuelve hoy**, en un párrafo y en lenguaje de tienda: sale de `docs/pantallas/<slug>.md`,
   `docs/datos/`, `docs/flujos/`, el ADR del módulo y el código. Si es algo nuevo, del ADR o del PR que lo trae. Con `rama`: `git diff origin/main...HEAD --stat`.
6. Las investigaciones ya hechas: `ls docs/investigacion/`. Se leen antes de buscar lo mismo en la web.
7. **Di la escala ANTES de lanzar** (Felipe cuida el consumo): cuántos agentes y si habrá búsqueda web.

## Paso 1 — Las cuatro miradas (agentes en paralelo)

**En UN solo mensaje, cuatro llamadas a `Agent`** (`general-purpose`, en segundo plano). Cada prompt = el «Contrato común» + el bloque de su
mirada (los dos en `referencia/miradas.md`) + el párrafo del paso 0.5 + la ruta de salida `<scratchpad>/innovar-AAAA-MM-DD/<mirada>.json`.
Espera las notificaciones; no repitas su trabajo mientras corren. Comprueba que cada JSON parsea (`node -e "JSON.parse(require('fs').readFileSync(p))"`);
si uno falló, relanza solo ese.

| Mirada | Pregunta madre | Contra quién compara |
|---|---|---|
| **A · Producto y experiencia** | ¿Cómo haría esto el mejor del mundo para que una vendedora lo resuelva en menos pasos, o no tenga que hacerlo? | Shopify POS, Square, Lightspeed (el qué); Linear, Stripe, Apple, Superhuman (el cómo) |
| **B · Arquitectura y código** | ¿Qué permite hoy el stack que haría esto más simple, más rápido o más fácil de cambiar? | Radar del stack: Next, React, TypeScript, Zod, Vercel, plataforma web |
| **C · Base de datos y reglas** | ¿Qué estado imposible, qué trabajo manual o qué cálculo repetido desaparece con un mejor modelo o una función nueva de Postgres o Supabase? | Postgres 18+, Supabase; cómo modelan Odoo, NetSuite, Stripe (ledger, idempotencia) |
| **D · Operación y calidad** | ¿Qué haría que esto se caiga menos, se vea mejor cuando falla, cueste menos o se pruebe solo? | Vercel, Supabase, Sentry; prácticas de Stripe y Linear |

Cada mirada busca en los dos horizontes: **ahora** (se construye con el stack actual en días o semanas) y **visión** (apuesta grande: meses, IA
en el flujo, algo externo). Felipe pidió **todas**, las equilibradas y las visionarias: ninguna mirada se autocensura por audaz; el escéptico filtra.

## Paso 2 — El escéptico

Cuando los cuatro JSON estén listos, **un solo `Agent`** recibe `referencia/esceptico.md`, los cuatro JSON y la ruta `<dir>/esceptico.json`.
Intenta **refutar** cada propuesta: ¿ya existe en el repo?, ¿la fuente dice eso?, ¿es moda?, ¿es para el volumen de CAYLA?, ¿choca con un ADR?,
¿es de otra skill? Fusiona duplicados entre miradas. Veredicto: **SE QUEDA** · **SE QUEDA CON CAMBIOS** · **DERIVAR a /x** · **DESCARTADA** (con motivo).

## Paso 3 — Rankear (lo haces tú)

Puntaje de cada propuesta que se queda: **impacto (1–5) × confianza (Alta 1 · Media 0,7 · Baja 0,4) ÷ esfuerzo (S 1 · M 2 · L 3 · XL 5)**.
Dos listas separadas, **Ahora** y **Visión**, cada una ordenada por puntaje; a igual puntaje, la de menor esfuerzo primero. El impacto se mide
por el negocio (minutos de una vendedora al día, soles, errores de stock, clientes), nunca por lo elegante. Se ve en `referencia/plantilla-informe.md`.

## Paso 4 — Informe y tablero

1. **Informe** en `docs/innovacion/AAAA-MM-DD-<slug>.md` (historial: no se sobrescribe; si ya existe, sufijo `-2`), con
   `referencia/plantilla-informe.md`. Las propuestas llevan id `<slug>#<n>` (p. ej. `vender#3`): no chocan entre sesiones.
2. **Tablero** `docs/innovacion/README.md`: una fila por propuesta que se queda, con estado `propuesta`. Las `DESCARTADA` van solo al informe,
   con su motivo (así el próximo no las repite). Las `DERIVAR` van a la sección «Para otras skills» del informe.
3. **Chat** (máximo ~25 líneas): las **3 primeras de Ahora** y las **3 primeras de Visión** (una línea cada una: qué, para quién, referente,
   esfuerzo), cuántas más hay en el informe con su ruta, lo derivado en una línea, y si el radar está viejo.

## Paso 5 — Preguntar a Felipe

Con `AskUserQuestion` (`multiSelect: true`): «¿Cuáles construyo?», con las 3 de Ahora como opciones (la de mayor puntaje primero, marcada
«(Recomendado)»; en cada una «Ganas / Pagas») y la cuarta opción «Ninguna por ahora». Una segunda pregunta solo si hay una propuesta de cambio de
regla o una de Visión que pida una decisión de negocio (cómo opera CAYLA, dinero, permisos). Lo técnico lo decides tú y lo explicas en tres líneas.
Refleja lo elegido en el tablero (`aceptada` o `descartada por Felipe`, con su fecha).

## Paso 6 — Construir lo aceptado (solo con el OK)

- Algo chico (un archivo, una pantalla): se hace aquí mismo, con las skills obligatorias que toque (`/milimetro` antes de lo visual, `/focus`,
  `/sugerir`, `/guia`, `/chaos` si guarda), commit con Conventional Commits.
- Algo grande (pantalla o módulo nuevo, migración con RPC + UI): con `/construir`, actividad por actividad.
- Varias aceptadas e independientes: ofrécelas como sesiones aparte, una por propuesta, con su brief.
- Al cerrarla, su fila del tablero pasa a `hecha` con el PR. Lo que toca producción sigue las reglas de «Cómo aplicar SQL a producción».

## Modos

- **`rapido`**: sin agentes y sin web. Tú solo, con el radar como fuente: 3 de Ahora + 3 de Visión, sin escéptico. El informe lo dice en su
  primera línea («pasada rápida — sin escéptico, puede traer ideas que no aguantan»). Para algo nuevo y chico. **Aunque no haya escéptico, la
  pregunta «¿ya existe?» la haces tú con cada idea** (`grep` en el código y en `docs/adr/`): en la primera corrida (Apartados, 2026-11-13) dos
  ideas del radar ya estaban construidas. Ejemplo de informe: `docs/innovacion/2026-11-13-vender-apartados.md`.
- **normal**: las 4 miradas + el escéptico. Cada mirada lee el radar primero y busca en la web **solo lo que el radar no cubre** (tope: 4 búsquedas por mirada).
- **`profundo`**: refresca el radar si tiene más de 14 días, y cada mirada investiga a fondo en la web (WebSearch `extended`, fuentes primarias,
  hasta 12 búsquedas) y, si ayuda, abre la página pública de un referente en el navegador integrado y la captura para el informe. Para un módulo entero o `todo`.

## Modo radar (`/innovar radar`)

Refresca `docs/radar/` sin auditar nada: dos agentes en paralelo con los prompts de `referencia/radar.md` (stack · referentes). Cada entrada que
cambia de anillo se marca (`↑ subió`, `↓ bajó`, `nuevo`, `salió`) y la fecha del `README.md` se actualiza. Lo corre la rutina semanal (cada lunes, 9:00 de Lima, con Opus 5.5: «Radar de innovación · refresco semanal», en claude.ai/code/routines), o Felipe a mano.

## Cierre

1. `git status --short`: solo `docs/innovacion/` (y `docs/radar/` en modo radar o profundo). Si algo más cambió, un agente rompió la regla.
2. Tres líneas de docencia: **QUÉ HICE** (en lenguaje de negocio) · **POR QUÉ ASÍ** · **QUÉ SE ROMPERÍA SIN ESTO**.
3. No hagas commit ni PR del informe sin que Felipe lo pida; ofrécelo en una línea.
