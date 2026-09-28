# ADR-0259 · Bitácora y backlog, una entrada por archivo; y el CI corre según lo que toca el PR

- **Fecha:** 2026-09-28 · **Estado:** aceptado. Sin migración: cambia el CI (`.github/workflows/ci.yml`), las
  instrucciones (CLAUDE.md, skills, plantilla de PR) y dónde se escriben la bitácora y el backlog.
- **Pedido:** Felipe, 2026-09-28, después de resolver dos veces el mismo día el choque de `BITACORA.md` en el PR #568:
  «somos 6 y nos toma demasiado tiempo poder hacer merge a nuestros PR… necesito una solución para eso». Pidió
  saltarse las pruebas cuando el conflicto es solo de documentación. Se le propusieron A + B (abajo) en vez de eso, y
  los aprobó.
- **Complementa:** CLAUDE.md «Ritual de sesión y estado vivo»; ADR-0066 (el job de Postgres, que nació como piloto).

## Qué había

- **La protección de `main` no exige estar al día** (`strict: false`, consultado el 2026-09-28). Un PR que no choca
  se fusiona sin volver a correr nada. Lo único que obligaba a poner un PR al día, y con eso a esperar otra vez el CI,
  era un conflicto.
- **Los conflictos eran casi siempre los mismos dos archivos.** En la semana al 2026-09-28: `docs/BACKLOG.md` 328
  commits y `docs/BITACORA.md` 321, los dos más tocados del repo. Cada PR metía su entrada arriba del todo, en la
  misma línea para todos (la 6 de BITACORA, la 31 de BACKLOG), así que el segundo PR que se fusionaba chocaba
  **siempre**. Con seis personas, el bucle era: resolver → esperar el CI → otro fusiona antes → chocar de nuevo.
- **El CI tardaba lo mismo para cualquier PR.** «Pruebas de RPC contra Postgres» = 6 min 22 s (medido en la corrida
  36470517947): 1 min 30 s en levantar Postgres y ~4 min 50 s en ~110 pruebas. Corría entero aunque el PR solo
  cambiara una pantalla o un documento.

## Decisión

**A. Una entrada, un archivo.** Desde el 2026-09-29 la bitácora de cada cierre va en
`docs/bitacora/AAAA-MM-DD-<tema>.md` y la sección de backlog en `docs/backlog/AAAA-MM-DD-<tema>.md` (`<tema>` = la
rama sin `claude/`). Dos PR no escriben nunca en el mismo archivo: el choque desaparece en vez de resolverse más rápido.
`BITACORA.md` y `BACKLOG.md` quedan como historia: se puede tachar un pendiente o corregir una sección vieja, y la skill
`/backlog` sigue reescribiendo los cubos de `BACKLOG.md`, pero no entran secciones nuevas. Lo vigila un candado en el job
obligatorio «Tipos, lint y pruebas» (`scripts/docs/entradas-por-archivo.mjs`): rechaza un encabezado `## ` con fecha
posterior al 2026-09-28 en esos dos archivos. Las entradas de los PR que ya estaban abiertos (#550, #568, #571, #572,
todas del 28 o antes) pasan: nadie tiene que tocar su PR.

**B. El job de Postgres corre según lo que toca el PR.** Un job nuevo, «Qué toca el PR» (`scripts/ci/alcance.mjs`),
compara el PR con el `main` de hoy y decide:

| El PR cambia… | Alcance | Qué corre | Tiempo del job |
|---|---|---|---|
| solo documentos (`docs/`, `*.md`, `.claude/`, `.agents/`, `graphify-out/`) | `nada` | nada: la base y la web son las de `main` | 0 |
| además, solo `apps/web/` | `web` | Postgres + solo las pruebas que leen la web | ~2 min |
| cualquier otra cosa, o es un push a `main` | `completo` | todo, como antes | ~6 min |

Las pruebas «que leen la web» no son una lista escrita a mano: `scripts/ci/pruebas-web.mjs` lee cada `pnpm pruebas:*` y
lo que importa en cadena, y toma las que nombran `apps/web`. Hoy son tres: `roles-cobertura` (lee cada `.rpc("…")` de
las pantallas), `frescura-lectura` y `fn-movimientos-busqueda-especial` (comparan contra fixtures de `apps/web/lib`).
Una prueba nueva que lea la web entra sola.

Con el job de Tipos, lint y pruebas (~2 min 40 s, sin cambios), un PR de pantallas pasa de ~6 min 30 s a ~2 min
40 s de espera total, y uno de documentos, a lo que tarde ese job.

## Qué se descartó

- **Saltarse el CI cuando el último commit solo resolvió un conflicto de documentación** (lo que Felipe pidió al
  principio). Ese commit no trae solo texto: trae todo lo que se fusionó a `main` mientras tanto. El 2026-09-28 el
  segundo choque del #568 trajo el código del buscador del #564; la ficha de productos y ese buscador nunca habían
  corrido juntos. Y en este repo fusionar a `main` es publicar. Además, el check obligatorio tendría que salir verde sin
  haber corrido: un verde falso.
- **`merge=union` en `.gitattributes`** para que git junte las dos entradas solo. Funciona en la máquina de cada uno,
  pero el botón de fusionar de GitHub no usa esos atributos: el PR seguiría saliendo «con conflictos».
- **Saltarse el job entero en un PR de pantallas.** `roles-cobertura` lee todo `apps/web`: un `.rpc("nueva")` en una
  pantalla puede ponerla roja. Por eso el nivel `web` corre esas pruebas en vez de saltarlo.
- **Decidir por el contenido del diff** («el PR no agrega un `.rpc(`»). Un nombre de función puede vivir en una
  constante de otro archivo: ese atajo se equivocaría hacia el verde. Las reglas elegidas solo pueden equivocarse
  hacia correr de más.
- **Merge queue de GitHub** (prueba cada PR sobre el anterior y fusiona sola). Es la solución de fondo para seis
  personas, pero exige que el repo esté en una organización de GitHub; hoy está en una cuenta personal. Queda como
  decisión de Felipe.

## Cómo falla, y hacia dónde

- **Si «Qué toca el PR» falla**, su salida llega vacía y el job de Postgres corre `completo`: tiene
  `if: !cancelled() && alcance != 'nada'`, no `success()`. Un fallo nunca salta pruebas.
- **Un archivo en una carpeta nueva** (ni documentos, ni web) → `completo`.
- **Un script `pruebas:*` que no es `node archivo.mjs`** → se trata como que lee la web.
- **Lo que esto NO cubre:** dos PR que por separado pasan y juntos rompen `main`. Pasaba antes igual (`strict: false`):
  el choque de BITACORA hacía, de casualidad, de prueba conjunta para algunos PR, y esa casualidad desaparece. La red
  es el CI que corre entero en cada push a `main`, **después** de publicar. Cerrar ese hueco es la merge queue (arriba).
- **Sin verificar al fusionar este ADR:** que GitHub cuente el job saltado (`nada`) como aprobado en la protección de
  `main`. Así lo documenta GitHub para jobs saltados por un `if`, pero no se pudo probar desde una rama. Si un PR de
  solo documentos queda «esperando» ese check, la corrección es cambiar el `if` del job por pasos saltados dentro del job.

## SE ROMPE SI

Una prueba de Postgres empieza a depender de la web por un camino que el detector no ve: un archivo leído con una ruta
armada en tiempo de ejecución (`join(RAIZ, "apps", app)` con `app = "web"` en otra línea), o un proceso hijo que
corre código de `apps/web`. Esa prueba se saltaría en un PR de pantallas y su rojo aparecería recién en `main`. Se evita
escribiendo la ruta literal, que es como lo hacen las tres de hoy.
