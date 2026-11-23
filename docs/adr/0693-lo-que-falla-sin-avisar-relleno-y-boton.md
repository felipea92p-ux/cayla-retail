# ADR-0693 — Lo que falla sin avisar: el relleno a propósito y el botón que no hace lo que dice

**Fecha:** 2026-11-23 · **Estado:** aceptado por Felipe (las dos ideas salieron de revisar el repositorio de skills `affaan-m/ecc`, del agente
`silent-failure-hunter` y de la skill `click-path-audit`, y Felipe las aprobó el 2026-11-23 para llevarlas al repo).
Construye sobre la skill `skill-evaluacion-observabilidad` (PR #752) y ADR-0356 (`/chaos`).

## Contexto

Los detectores propios ven dos clases de falla: la que se nota (una pantalla caída, un error en la consola, un 500) y la que deja la base
en un estado imposible (las invariantes de `/chaos`). Hay una tercera que ninguno ve: **la que no falla en nada visible**. No hay error, no
se escribe nada malo, la pantalla sigue en pie, y aun así algo no pasó. Dos formas de esa falla son comunes en este repo:

1. **El relleno.** `getCambiosBancarios(id).catch(() => [])`: si la lectura falla, la ficha muestra un historial vacío. A veces es justo lo
   que se quiere (una parte opcional de la pantalla, que sin la función de la base sale como antes), y a veces esconde una falla que alguien
   tendría que saber. Mirando el código no se distinguen. El escáner de observabilidad marcaba un `catch {}` vacío, pero daba por tratado un
   `catch { return [] }` (contaba el `return` como relanzar) y no miraba los `.catch(() => …)`. Medido el 2026-11-23 en `apps/web`: **184
   rellenos en 115 archivos** (95 son `=> null`).
2. **El botón que no hace lo que dice.** Ver la segunda parte, más abajo.

## Decisión 1 — Un relleno dice por qué (`relleno-silencioso`, candado del CI)

1. **Qué es un relleno.** Un manejador que SOLO pone un valor en lugar del error: `.catch(() => null | [] | {} | undefined | false | "" |
   new Map() | fallback)`, `.catch(() => {})`, un objeto de vacíos (`({ data: null })`) o un `catch` cuyo único paso es `return <eso>`
   (`unstable_rethrow(e)` no cuenta como tratar el error: solo deja pasar los avisos internos de Next).
2. **Qué no lo es**, porque ya no es silencioso: lo que avisa o registra (`console.error`, `capturarError`, `avisar.*`), relanza, usa el error
   (`({ error: String(e) })`), lleva el aviso dentro (un texto escrito, `{ fallo: TEXTO }`) o deja una señal que la pantalla lee
   (`incompleto = true`, `setFallo(true)`); una referencia (`.catch(manejar)`); y el cuerpo de una respuesta (`res.json().catch(() => null)`,
   `.text()`…): ahí la falla de la petición ya se ve en `res.ok`.
3. **El relleno a propósito lo dice en su línea:** `// relleno-a-proposito: <qué pasa si falla, 10 caracteres o más>`, en la línea del
   `catch`, en el comentario pegado arriba o dentro del manejador. Se llama así y no `relleno-fijo` (como `tema-fijo`, `sugerir-fijo`) porque
   aquí nada queda «fijo»: lo que se declara es la intención, y la marca se lee como la frase que es.
4. **La deuda solo baja.** `apps/web/lib/relleno-silencioso-archivos.ts` guarda cuántos rellenos sin marca tenía cada archivo el 2026-11-23
   (`PENDIENTES_HOY`) y `apps/web/lib/relleno-silencioso.test.ts` falla si un archivo suma uno (o si nace en un archivo nuevo), y también si
   uno bajó y la lista no se actualizó. Por archivo y con su cuenta, no solo la lista de archivos: si no, un relleno nuevo en un archivo ya
   listado pasaría sin ruido.
5. **La definición es una sola:** el escáner `scripts/rendimiento/observabilidad.mjs` (`rellenosSinMarca`), que la prueba importa. Sus casos
   buenos y malos (`scripts/rendimiento/rendimiento.test.mjs`) corren desde hoy en el CI («Escáneres de rendimiento y observabilidad»): antes
   no corrían en ninguna parte.

**El estado de partida.** De los 184, **55 ya explicaban su motivo** en un comentario cercano («opcional como las marcas; si falla, la ficha se
pinta sin el historial», el comentario de su función que dice «Nunca lanza: si la lectura falla, vacío y la pantalla cuenta como antes») y se
marcaron a mano, reusando esa frase. **Quedan 129 en 94 archivos** como deuda. Un comentario que solo decía para qué sirve la lectura, sin decir
qué pasa si falla, no se tomó como motivo: ese relleno quedó en la deuda.

### Por qué así

- **Un candado por línea, con su motivo junto al código,** como las otras marcas del repo (`tema-fijo`, `sugerir-fijo`, `unificar-fijo`,
  `monto-partible`): quien lee el relleno lee por qué, y quien escribe uno nuevo se entera en el CI, no cuando una tienda reporta «el
  historial salió vacío».
- **No se prohíbe el relleno:** la mayoría son buenos (principio 9: una dependencia que no responde no tumba la pantalla). Lo que se exige es
  que se distinga el buscado del accidental.

### Descarté

- **Contar todos los `.catch(` sin parámetro** (la cuenta rápida con texto): marcaba `x().catch(() => setFallo(true))` y
  `.catch(() => "No se pudo hablar con el servidor")`, que sí avisan. Con el AST se separan.
- **Una lista solo de archivos** (como `sugerir-archivos.ts`): dejaría crecer un archivo que ya está en la deuda.
- **Arreglar los 129 en este cambio:** cada uno es una decisión de qué debe pasar si esa lectura falla, y varias tocan dinero o stock. La skill
  de observabilidad los toma al auditar cada módulo.

### Se rompe si

- Alguien escribe la marca con un motivo de relleno («ok», «a propósito») para callar la prueba: la prueba no lo distingue (exige 10
  caracteres). Lo ataja la revisión, como con las otras marcas.
- El escáner deja de ver una forma nueva de relleno (`Promise.allSettled` sin mirar el `reason`, por ejemplo): no está cubierta hoy.

## Decisión 2 — Una familia nueva en `/chaos`: «El botón que no hace lo que dice» (`boton`, `BOT-*`)

`/chaos` ve lo que se cae y lo que deja la base imposible. No veía el botón que **no logra lo que promete** sin que falle nada: no hay error
en la consola, las invariantes callan (no se escribió nada malo; a veces no se escribió nada) y la pantalla dice «Listo». La skill
`click-path-audit` de `affaan-m/ecc` (commit `3f14a10`, leída como texto) lo persigue en apps con stores; se tomaron sus patrones 4 a 6 (la
transición que falta, el camino muerto, el efecto que interfiere) y la carrera entre dos acciones async, aterrizados a este repo:

1. **Ocho ataques** (`scripts/chaos/catalogo.mjs`), cuatro de núcleo para toda pantalla que guarda: BOT-01 «Lo que dice el botón, ¿quedó
   hecho?» (compara lo que la pantalla dice, lo que muestra al recargar y la base), BOT-02 «El refresco que pisa lo recién hecho», BOT-03
   «El efecto que lo deshace» y BOT-05 «El aviso que miente» (un error que llega con «Listo»). Fuera del núcleo: BOT-04 «Dos respuestas que
   llegan al revés», BOT-06 «El verbo sin su llamada», BOT-07 «El camino que nunca se recorre» y BOT-08 «Cerrar y volver a abrir». Ninguno es
   de gravedad 1 ni cita invariantes: es justo la falla que ellas no ven (una prueba lo fija).
2. **La lectura del código va primero** (`scripts/chaos/boton.mjs`): el paso 1 de `click-path-audit` es un mapa de qué acción de cada store
   resetea qué. Aquí no hay stores (Zustand/Redux); lo que pisa el estado local son **las props del servidor y los efectos que las copian**. El
   lector marca, con el AST y su línea, `refresco-tras-guardar` (un `router.refresh()`/`push`/`replace` o `revalidatePath` tras un `await` o
   en un `.then`), `efecto-que-pisa` (un `useEffect` con dependencias que vuelve a poner un estado) y `efecto-sin-guardia` (un efecto que lee y
   pone el resultado sin limpiar al salir), y pone primero las fuertes: el refresco **junto a** un efecto que copia una prop. Cada pista
   apunta a su ataque; sus casos buenos y malos corren en el CI («Lectura del código de caos»).

### Por qué así

- **Un ataque, no un candado del CI.** Un refresco tras guardar es lo normal en este repo (306 en la web el 2026-11-23): casi todos están
  bien, y solo el navegador dice cuál se lleva lo que la persona tenía a medias. La lectura del código prioriza; el ataque decide.
- **La combinación primero.** Medido el mismo día: 24 efectos que copian una prop y 9 archivos con uno de ellos junto a un refresco (Vender
  entre ellos). Por ahí se empieza.

### Descarté

- **Copiar el paso 1 de `click-path-audit` tal cual** (mapear stores): no hay stores que mapear.
- **El «cierre viejo» (su patrón 3, `setCount(count + 1)` dos veces):** lo cubre el lint de dependencias de React y no apareció en las
  pantallas que guardan.
- **Mantener las semillas viejas idénticas:** el azar se arma sobre la lista entera, así que una semilla de antes del 2026-11-23 sortea
  distinto. Para repetir una corrida vieja exacta, `--familias` con las ocho de entonces (la familia nueva va al final del catálogo y queda
  afuera). Está dicho en la skill.

### Se rompe si

- Una pantalla «sincroniza» el estado con algo que no es un `useEffect` (un `key` que remonta el componente, un estado derivado en el
  render): el lector no lo marca, y BOT-01 y BOT-03 en el navegador son los que lo atrapan.

## Archivos

- `scripts/chaos/catalogo.mjs` (la familia `boton`), `scripts/chaos/boton.mjs` y sus pruebas (`catalogo.test.mjs`, `boton.test.mjs`).
- `.claude/skills/chaos/SKILL.md` — la lectura del código antes de la familia, las tres lecturas que se comparan y la gravedad 2.
- `scripts/rendimiento/observabilidad.mjs` — `relleno-silencioso`, `MARCA_RELLENO`, `rellenosSinMarca`.
- `scripts/rendimiento/rendimiento.test.mjs` — los casos buenos y malos.
- `apps/web/lib/relleno-silencioso-archivos.ts` y `apps/web/lib/relleno-silencioso.test.ts` — la deuda y su candado.
- `.claude/skills/skill-evaluacion-observabilidad/SKILL.md` — la regla en la auditoría.
- `.github/workflows/ci.yml`, `knip.ts`.
