# ADR-0692 — Las reglas viven por carpeta: `CLAUDE.md` corto y `.claude/rules/`

**Fecha:** 2026-11-23 · **Estado:** aprobado por Felipe el 2026-11-23 (la propuesta A de
`docs/investigacion/2026-11-19-ecc-reglas-que-chocan.md`, rama `claude/ecc-skills-agents-analysis-3dd8fe`, junto con otras nueve
piezas que corren en sesiones aparte). Cambia dónde viven las reglas, no qué dicen.

## Contexto

`CLAUDE.md` medía **144.942 bytes y 1.013 líneas** (`main` del 2026-11-23, `2a8ef513a`): unos 35 mil tokens que Claude Code carga en
**cada** sesión, también en una que solo toca una migración o un texto de la tienda. Recibe unos 76 commits al mes. La documentación
de Claude Code (code.claude.com/docs/en/memory.md, consultada el 2026-11-19) recomienda menos de 200 líneas por archivo y dice que un
archivo largo consume contexto y **reduce la adherencia**: el tamaño juega en contra de lo que el tamaño busca. Una regla nueva entraba
con su historia y su lista de excepciones, y la regla vigente se perdía en la línea 700.

Claude Code ya trae el mecanismo: un archivo `.claude/rules/<tema>.md` con `paths:` en su encabezado se carga solo cuando Claude lee o
edita un archivo de esas rutas (Read, Write, Edit, o un `cat`/`head`); uno sin `paths:` se carga siempre. Un `@import` no ahorra nada:
se carga junto al archivo que lo importa.

## Decisión

1. **`CLAUDE.md` raíz (238 líneas, 26 KB):** el rol y la nota de arquitectura, los 12 principios, la autonomía, el vocabulario, el
   idioma, las convenciones, el protocolo y el ritual de sesión (con «Números y PR» y «Celular obligatorio») **tal cual**; y lo nuevo:
   «Dónde viven las reglas», **«Reglas que cruzan todo el repo»** (una o pocas líneas cada una, con la prueba que la vigila y su
   archivo) y el **«Índice de las demás reglas»** (una fila por regla: lo que pide, qué la vigila, dónde está el detalle). Las
   transversales se quedan arriba porque una sesión las necesita antes de abrir un archivo: SQL a producción, solo tokens y modo oscuro,
   la estética del vidrio, Al milímetro, módulos y roles, guía de foco y sugerencias, familias fuera de los motores y precio 0, y
   números y PR.
2. **El detalle va a `.claude/rules/`, una carpeta por tema y partido por ruta.** Cada sección se **movió tal cual** (no se reescribió):
   ninguna regla cambia de sentido. Los nombres de las secciones se conservan en el índice, así que una referencia de una prueba, una
   skill o la plantilla del PR («CLAUDE.md «Guía de foco»») sigue llegando a su regla.
3. **La lista de excepciones de movimiento** (31 animaciones permitidas, 11 KB en un solo párrafo) sale a su propio archivo, una por
   línea, y se carga solo al tocar un CSS o una prueba de movimiento. Se comprobó que la lista es el mismo texto: rearmada con sus
   separadores originales da el párrafo de antes, salvo un «)» suelto que cerraba el paréntesis de «(únicas excepciones…».
4. **«Skills de este repo»** (10 KB) queda en la raíz como una lista de nombres agrupados; el párrafo entero, en `skills.md`.
5. **Una regla cambia en su archivo, nunca en dos lugares.** Una regla nueva va al archivo de su tema (o a uno nuevo con sus `paths:`) y
   suma su fila al índice; la raíz solo crece con una regla que de verdad cruce carpetas.
6. **`AGENTS.md`** (Codex y otras herramientas, que no cargan `.claude/rules/` solas) pasa a decir: lee `CLAUDE.md` y los archivos de
   `.claude/rules/` de lo que vas a tocar. **`scripts/flujo-de-negocio/espejo.mjs`** suma `.claude/rules/` a lo que puede diferir de
   `main` (antes ya tenía `CLAUDE.md`). Siete líneas de skills que apuntaban a «la tabla de `CLAUDE.md`» apuntan ahora a su archivo
   (`milimetro` hacía `grep "^## Una función, una pieza" CLAUDE.md`).

### Los archivos y cuándo se cargan

«Pantalla» = `apps/web/components/**/*.tsx`, `apps/web/app/**/*.tsx` y `apps/web/app/**/*.css`.

| Archivo | Trae | Se carga al tocar | KB |
|---|---|---|---|
| `sql-produccion.md` | Cómo aplicar SQL a producción (políticas y deadlocks, el SQL Editor que agrega líneas) | `supabase/**`, `scripts/**/*.sql`, `scripts/migraciones/**` | 4,8 |
| `datos.md` | La base de datos: `/docs/datos/` (la regla de oro del diccionario) | `supabase/**`, `docs/datos/**`, `packages/database/**`, `scripts/datos/**` | 1,9 |
| `modulos-y-roles.md` | Módulos y roles | `supabase/**`, `lib/modulos.ts`, `lib/menu.ts`, `lib/**/*rol*`, `app/**/layout.tsx`, `*Rol*.tsx`, `*Responsable*.tsx`, `scripts/pruebas/roles*` | 4,9 |
| `motores.md` | Familias fuera de los motores y el precio 0 | `supabase/**`, `lib/**/*motor*`, `lib/**/*precio*`, `components/punto-de-venta/**`, `scripts/pruebas/motores*` | 1,9 |
| `modales.md` | Movimiento y modales (sin la lista), animaciones apagadas, Escape, «atrás», teclas que suben, `pie-hoja-fijo` | pantalla, `lib/movimiento*` | 5,6 |
| `movimiento-excepciones.md` | Las 31 excepciones a «sin rebote, nunca en bucle» | `apps/web/app/**/*.css`, `lib/**/*movimiento*`, `docs/adr/0136-*` | 10,6 |
| `nextjs.md` | Server Components y `"use client"` | `apps/**/*.ts`, `apps/**/*.tsx` | 0,5 |
| `paleta.md` | Paleta y orden de pantalla | pantalla, `globals.css` | 2,5 |
| `vidrio.md` | El vidrio «Serena», nada de beige plano, los dos sistemas, 44 px, lo que flota | pantalla, `app/estilos/**`, `components/ui/**`, `docs/vidrio/**`, `docs/familia/**` | 8,2 |
| `modo-oscuro.md` | Modo oscuro | pantalla, `estilos/tema.css`, `apps/web/tema/**` | 5,1 |
| `pantallas.md` | Todo el ancho, la prenda sin foto, la página estable, los combos, poco texto | pantalla, `lib/combo-reglas.ts`, `lib/categoria-de-prenda.ts` | 6,9 |
| `carga-y-espera.md` | Carga y espera | pantalla, `lib/espera-*` | 4,2 |
| `guia-de-foco.md` | Guía de foco | pantalla, `lib/*-guia.ts`, `lib/guia-*`, `scripts/focus/**` | 7,0 |
| `sugerencias.md` | Sugerencias coherentes y «Existe también» | pantalla, `lib/sugerencias-*`, `lib/sugerir-*`, `lib/atributo-parecido*`, `scripts/sugerir/**` | 5,6 |
| `unificar.md` | Una función, una pieza (con la tabla de piezas únicas) | pantalla, `apps/web/unificar/**`, `docs/unificar/**` | 28,7 |
| `finanzas.md` | Pantallas de Finanzas | `app/**/finanzas/**`, `components/finanzas/**`, `finanzas.css`, `vidrio/estados.css`, `lib/estados-*` | 2,6 |
| `version-nueva.md` | Aviso de versión nueva | `VersionNueva.tsx`, `app/api/version/**`, `lib/version-nueva*`, `next.config.ts` | 1,2 |
| `diseno.md` | Al milímetro, Formidable, skills de diseño de afuera | `docs/milimetro/**`, `docs/formidable/**`, `docs/maquetas/**`, `scripts/milimetro/**`, `apps/tienda/**`, `al-milimetro.yml` | 8,1 |
| `tienda.md` | La tienda y el ERP no comparten estilos | `apps/tienda/**`, `packages/shared/**` | 0,7 |
| `guias.md` | Guías interactivas | `lib/guias/**`, `apps/web/guias/**`, `lib/guias.test.ts` | 3,8 |
| `caos.md` | Caos | `scripts/chaos/**`, `docs/chaos/**` | 3,1 |
| `knip.md` | Código muerto: Knip en el CI | `knip.ts`, `scripts/knip/**` | 2,0 |
| `skills.md` | Skills de este repo, el párrafo entero | `.claude/skills/**`, `.agents/skills/**` | 10,3 |
| `graphify.md` | graphify | `graphify-out/**`, `.claude/settings*.json` | 1,6 |

### Tabla de control: cada sección de antes y dónde quedó

Comprobado con un script que busca cada línea de texto de `CLAUDE.md` de antes (887 líneas) en la raíz nueva y en `.claude/rules/`,
sin mirar los saltos de línea: **871 están tal cual** y 16 se cambiaron a propósito (abajo). Ninguna se perdió.

| Sección de antes | Dónde quedó |
|---|---|
| Cabecera y nota de arquitectura, Rol, Los 12 principios, Reglas de ejecución, Convenciones de código, Vocabulario obligatorio, Idioma, Protocolo de pregunta y de docencia, Ritual de sesión (con Números y PR y Celular obligatorio) | `CLAUDE.md`, tal cual |
| Cómo aplicar SQL a producción | `sql-produccion.md` (y su resumen en la raíz) |
| Movimiento y modales | `modales.md`, `movimiento-excepciones.md` y `nextjs.md` (Server Components) |
| Paleta y orden de pantalla | `paleta.md` |
| El vidrio «Serena» | `vidrio.md` (la estética obligatoria, también resumida en la raíz) |
| Toda pantalla ocupa todo el ancho · La prenda sin foto · La página no se encoge bajo el mouse · Buscador y paginado de combos · Poco texto a la vista | `pantallas.md` |
| Modo oscuro | `modo-oscuro.md` |
| Pantallas de Finanzas | `finanzas.md` |
| Carga y espera | `carga-y-espera.md` |
| Aviso de versión nueva | `version-nueva.md` |
| Módulos y roles | `modulos-y-roles.md` (y su resumen en la raíz) |
| Guía de foco | `guia-de-foco.md` (y su resumen en la raíz) |
| Sugerencias coherentes · «Existe también» | `sugerencias.md` |
| Formidable · Skills de diseño de afuera · Al milímetro | `diseno.md` |
| La tienda y el ERP no comparten estilos | `tienda.md` |
| Una función, una pieza | `unificar.md` |
| Guías interactivas | `guias.md` |
| Caos | `caos.md` |
| Familias fuera de los motores | `motores.md` (y su resumen en la raíz) |
| Código muerto: Knip en el CI | `knip.md` |
| La base de datos: `/docs/datos/` | `datos.md`; su «Antes de empezar algo grande», al ritual de la raíz; su párrafo de skills, a `skills.md` |
| graphify | `graphify.md` (y su resumen en la raíz) |

**Las 16 líneas que cambiaron, y por qué:**

- Principio 8: «Este archivo» → «Este archivo y `.claude/rules/`» (las reglas ya no viven en un solo archivo).
- Ritual: «leo el camino mínimo: este archivo» suma «(las reglas de `.claude/rules/` se cargan solas al tocar su carpeta)», y la
  advertencia «Antes de empezar algo grande… git status» (3 líneas de la sección de la base de datos), que repetía el ritual, queda
  como su paréntesis: «(el 2026-09-12 dos sesiones escribieron la misma documentación en paralelo sin saberlo)».
- Vocabulario: «ver «Módulos y roles» arriba» → «más abajo».
- `paleta.md`: «ver «Modo oscuro» más abajo» → «(`modo-oscuro.md`)». `modulos-y-roles.md`: «(regla «Guía de foco», más abajo)» →
  «(`guia-de-foco.md`)». `unificar.md`: «(ver «Paleta y orden de pantalla»)» suma «`paleta.md`».
- `diseno.md`: «Este archivo manda sobre ellas» y «choca con este archivo, gana este archivo» → «`CLAUDE.md` y `.claude/rules/`»
  (en su archivo nuevo, «este archivo» habría dicho lo contrario).
- Las 4 líneas del párrafo de excepciones de movimiento: ahora una lista (punto 3 de la decisión).

### Medición (bytes, y tokens estimados como bytes ÷ 4,1)

| Sesión | Antes | Ahora | Se cargan además de la raíz |
|---|---|---|---|
| Cualquiera, al empezar | 141,5 KB (~35 mil) | 26,0 KB (~6,5 mil), **82 % menos** | — |
| Solo SQL (una migración) | 141,5 KB | 39,6 KB (~9,9 mil), **72 % menos** | `sql-produccion`, `datos`, `modulos-y-roles`, `motores` |
| Una regla de negocio en `lib/` | 141,5 KB | 26,5 KB, **81 % menos** | `nextjs` |
| La tienda web | 141,5 KB | 35,4 KB, **75 % menos** | `diseno`, `tienda`, `nextjs` |
| Un modal (solo su `.tsx`) | 141,5 KB | 100,4 KB (~25 mil), **29 % menos** | las 10 de pantalla |
| Un modal con su CSS | 141,5 KB | 111,0 KB, **22 % menos** | las 10 de pantalla + las excepciones de movimiento |

Una sesión que toca pantallas carga casi todo lo de pantallas, como hoy: era lo esperado (casi todas esas reglas le aplican). Lo que
más pesa ahí es la tabla de `unificar.md` (28,7 KB). `/context` en una sesión real dice la cifra exacta; el script de la medición
calcula qué reglas calzan con los `paths:` de cada caso.

## Alternativas descartadas

- **`@imports` desde `CLAUDE.md`:** se cargan siempre; no ahorran contexto.
- **Un `CLAUDE.md` en cada carpeta** (`supabase/CLAUDE.md`): funciona, pero reparte las reglas por todo el árbol y una regla de
  pantallas no tiene una sola carpeta (vive en `components/` y en `app/`). `.claude/rules/` las junta en un lugar con rutas explícitas.
- **Reescribir cada regla a una línea ahora, y llevar su historia a su ADR:** es lo que pide el principio, pero hacerlo a la vez que
  se mueven 145 KB, en un archivo que recibe 76 commits al mes, mezcla dos riesgos y vuelve imposible comprobar que nada cambió de
  sentido. Se hizo en dos tiempos: ahora se mueve tal cual (comprobado línea por línea) y la raíz es corta; acortar cada archivo de
  regla (la historia «aprendido el…» a su ADR) queda para quien toque esa regla.
- **Dejar en la raíz solo el índice, sin transversales:** una sesión que diseña una RPC desde la conversación todavía no abrió
  `supabase/`, y una regla con `paths:` solo se carga al tocar su ruta.

## Consecuencias

- **Ganas:** 6,5 mil tokens al empezar en vez de 35 mil; cada sesión ve las reglas de lo que está tocando; una regla se lee entera en
  su archivo, y dos sesiones que cambian reglas distintas ya no chocan en el mismo archivo.
- **Pagas:** una regla puede quedar en una ruta que no se toca. Se mitiga con el índice y las transversales en la raíz, y con un
  `/revision` que lo revise. Codex no carga `.claude/rules/` solo: `AGENTS.md` le dice que los lea.
- **Para las demás sesiones:** desde que esto entre a `main`, una regla se cambia en su archivo de `.claude/rules/`. Un PR abierto que
  edite una sección vieja de `CLAUDE.md` va a chocar: su cambio va al archivo de esa sección (la tabla de arriba dice cuál).
