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

## Archivos

- `scripts/rendimiento/observabilidad.mjs` — `relleno-silencioso`, `MARCA_RELLENO`, `rellenosSinMarca`.
- `scripts/rendimiento/rendimiento.test.mjs` — los casos buenos y malos.
- `apps/web/lib/relleno-silencioso-archivos.ts` y `apps/web/lib/relleno-silencioso.test.ts` — la deuda y su candado.
- `.claude/skills/skill-evaluacion-observabilidad/SKILL.md` — la regla en la auditoría.
- `.github/workflows/ci.yml`, `knip.ts`.
