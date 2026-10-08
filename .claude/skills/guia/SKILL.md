---
name: guia
description: Crea o pone al día la GUÍA INTERACTIVA de una pantalla del ERP (la demo con el velo oscuro que enciende una pieza a la vez y explica qué es y para qué sirve; CLAUDE.md «Guías interactivas», ADR-0362). Con una ruta (`/vender/historial`) o un módulo (`ventas`), escribe la guía que falta; sin argumentos, revisa lo que cambiaste en la rama y pone al día las guías de esas pantallas (lo que pide la prueba cuando la «huella de controles» ya no coincide); con `todo`, solo informa el tablero. Ancla cada paso a un `data-guia`, nunca hace que el piloto guarde nada, prueba la guía en el navegador (escritorio y 375 px, claro y oscuro) con `guias:recorrer`, y recién ahí acepta la huella. Úsala cuando Felipe diga «guía», «demo», «tutorial» o «recorrido» de una pantalla, cuando `lib/guias.test.ts` falle por una huella, y antes de dar por terminada una pantalla nueva o editada.
---

Crea o pone al día la guía interactiva de: $ARGUMENTS

**Regla madre (Felipe, 2026-10-07):** cada pantalla tiene una demo que la recorre pieza por pieza y explica para qué sirve, y la demo
está **siempre al día** con la pantalla: si se agrega, quita o cambia algo, la guía cambia con ella. Una guía vieja (que explica un
botón que ya no existe o calla uno nuevo) enseña mal, y es peor que no tener guía.

**Segunda regla madre: la demo NUNCA guarda.** Corre en la tienda de verdad (producción). El piloto puede abrir un modal, cambiar de
pestaña, escribir un ejemplo y elegir; jamás cobrar, apartar, confirmar, anular, enviar ni nada que llegue a la base. El motor lo
impide (`motivoParaNoTocar`, `lib/guias/reglas.ts`) y el recorredor lo vigila en la red; tú tampoco lo intentas: el paso que guarda
se **explica**, con la pieza encendida, sin tocarla.

## Las piezas (no inventes otras)

| Qué | Dónde |
|---|---|
| Vocabulario (guía, paso, acción del piloto) | `apps/web/lib/guias/tipos.ts` |
| Reglas puras (no tocar, rutas, total, geometría) | `apps/web/lib/guias/reglas.ts` + su prueba |
| El contenido de cada guía | `apps/web/lib/guias/pantallas/<módulo>.ts` |
| El tablero (aplicada / no-aplica / pendiente, `PENDIENTES_HOY`) | `apps/web/lib/guias/registro.ts` |
| Motor (velo, tarjeta), piloto, arranque, «Demo» del perfil | `apps/web/components/guias/` |
| Escáner (controles de una pantalla, anclas del código) | `apps/web/guias/escaner.mjs` |
| Huellas de controles (no se editan a mano) | `apps/web/lib/guias/huellas/<id>.json` |
| El candado del CI | `apps/web/lib/guias.test.ts` |
| Aceptar una huella / recorrer en el navegador | `pnpm --filter web guias:huella <id>` · `pnpm --filter web guias:recorrer` |

## Paso 1 — Alcance

- *(vacío)*: `git fetch origin main` y `git diff --name-only origin/main...HEAD` + lo no commiteado. Corre
  `pnpm --filter web exec vitest run lib/guias.test.ts`: cada huella que falla dice **qué controles nacieron o desaparecieron y en qué
  archivo**. Esas pantallas son tu alcance. Una pantalla nueva sin guía también (la prueba la nombra).
- una ruta o un módulo: esas pantallas, estén pendientes o no.
- `todo`: informa el tablero (`registro.ts`: cuántas aplicadas, no-aplica y pendientes, por módulo) y **no escribe nada**; el módulo
  que sigue lo elige Felipe.

Antes de escribir, avísale a Felipe en una línea qué pantallas vas a tocar y qué cambió en cada una.

## Paso 2 — Mira la pantalla como la vería una colaboradora nueva

1. Lee su `page.tsx` y los componentes que dibuja (`archivosDePantalla(ruta)` en el escáner te da la lista exacta) y su doc en
   `docs/pantallas/<pantalla>.md` si existe. Ábrela en el navegador (`preview_start`, cuenta local) en escritorio y a 375 px.
2. Haz la lista de **lo que se hace aquí**, en el orden en que se usa en la tienda (no en el orden del código): qué se mira primero,
   qué se toca, qué se abre, qué guarda. Cada cosa es un candidato a paso.
3. Decide qué NO va: un control que repite lo que ya se explicó (la ✕ de cada fila), un detalle técnico, algo que solo ve el
   desarrollador. «No explicar» es una decisión válida y la huella la registra igual al aceptarla.

## Paso 3 — Escribe la guía

1. **Anclas.** Cada pieza que se enciende lleva `data-guia="<pantalla>.<pieza>"` (minúsculas, guiones), en el elemento que mejor
   la encierra: el `<label>` del buscador, la fila de filtros, el `<aside>` del ticket. Una `<Pestanas>` acepta `guia` (la fila) y
   `items[].guia` (cada pestaña). Nunca anclas a clases de estilo ni a textos. Un `data-guia` sin paso que lo use **falla** la prueba.
2. **Pasos** en `lib/guias/pantallas/<módulo>.ts` (modelo: `vender.ts`):
   - el primero y el último sin ancla (`ancla: null`): qué es esta pantalla, y «Listo; para repasarlo: Mi perfil ▸ Demo ▸ …»;
   - título ≤ 40 letras, texto ≤ 320 (se entiende en 5 segundos, ADR-0350), con «tú», en lenguaje de tienda, sin jerga; el
     vocabulario obligatorio de CLAUDE.md (cliente, sede, colaborador; nunca clienta, socia, sucursal) lo vigila la prueba;
   - explica **para qué sirve**, no cómo está hecho («para separar prendas a un cliente que vuelve después»);
   - `opcional: true` si la pieza depende del rol o del estado (un botón que solo ve el líder, la persiana de caja cerrada); un paso
     no opcional cuya pieza no aparece se explica con la tarjeta al centro y el recorredor lo marca como roto;
   - `requiere` / `excluye` (anclas) para pasos que solo tienen sentido en un estado; `solo: "escritorio" | "celular"` si la pieza
     cambia de forma bajo 1024 px.
3. **Piloto.** `preparar` (antes de encender: abrir el modal o la pestaña donde vive la pieza) y `demostrar` (con la pieza ya
   encendida: escribir un ejemplo). Patrón que funciona: el paso «Cada prenda» explica la tarjeta; el SIGUIENTE paso la abre en su
   `preparar` — así la persona lee primero y ve abrirse después. El ejemplo que se escribe sale de la pantalla
   (`texto: { palabraDe: "<ancla>" }`), nunca inventado (ADR-0290). Lo que la guía abre lo cierra (`preparar: [{ tipo: "escape" }]`
   en el paso que sigue, y `alSalir` para vaciar lo escrito).
4. **Registro.** En `registro.ts`: importa la guía, súmala a `GUIAS`, pasa su ruta a `{ estado: "aplicada", guia: X.id }` y baja
   `PENDIENTES_HOY`. Si la pantalla no tiene nada que enseñar, `no-aplica` con su motivo (30 letras o más).

## Paso 4 — Pruébala de verdad (no se acepta una huella sin esto)

1. `pnpm --filter web exec vitest run lib/guias.test.ts lib/guias` en verde, salvo la huella (todavía no la aceptaste).
   Si la base local no tiene con qué mostrar la pantalla (un conteo abierto, una compra repartida), NO crees datos: declara en
   `guias/ejemplos.mjs` su `sinDatos` (una consulta de solo lectura que devuelve el motivo) y el recorredor la informa con ⚠.
2. Con el `next dev` de ESTA rama levantado (`preview_start`):
   `pnpm --filter web guias:recorrer -- --base-url http://localhost:<puerto> --guia <id>` en escritorio, y otra vez con
   `--ancho 375 --alto 812 --tema oscuro`. Tiene que decir ✓: cada paso encontró su pieza, **la demo no escribió en la base**, no
   quedó ningún modal abierto. Si la cuenta `admin` no ve la pantalla, prueba la que sí (`--cuenta`, claves de `tema/cuentas.mjs`).
3. **Mira las capturas** (`apps/web/guias/.salida/…`): que la tarjeta no tape lo que explica, que el recorte encierre la pieza
   justa, que el texto diga la verdad sobre lo que se ve. El recorredor no ve eso.
4. Si la pantalla está en la regla de celular (Vender, Cambios, Devoluciones), la captura a 375 px va al PR.

## Paso 5 — Acepta la huella y cierra

1. `pnpm --filter web guias:huella <id>`: muestra lo que nació (+) y lo que se fue (−). Léelo: cada `+` tiene que estar explicado en
   la guía o descartado a propósito por ti en el paso 2. Recién entonces la huella queda aceptada.
2. Commit con su `feat(guias): …` o, si el cambio fue de la pantalla, en el mismo commit que la pantalla.
3. Al cerrar, una línea a Felipe por pantalla: qué explica la guía nueva o qué cambió, y lo que decidiste NO explicar.

## Lo que esta skill no hace

- No cambia lo que hace una pantalla para que la guía sea más fácil (solo agrega `data-guia`, que no se ve).
- No toca dinero, stock, permisos ni SUNAT: el paso que los mueve se explica, no se ejecuta.
- No corre contra producción: el recorredor solo acepta `localhost`.
