# ADR-0545 — Retiro del código y de las funciones de la base que nadie usa

- **Fecha:** 2026-10-27 · **Estado:** código retirado y verificado en local; la migración `20261028003000` está escrita y **sin pegar en producción** (espera el OK puntual de Felipe: es un cambio de esquema).
  Los números de este ADR y de la migración están reservados para la rama `claude/ordenes-compra-modulo-fc9e27` (`pnpm reservar`).
- **Continúa a:** [ADR-0406](0406-knip-vigila-el-codigo-muerto.md) (Knip en el CI y la deuda de `knip --production`) y a
  `docs/investigacion/2026-10-14-codigo-que-solo-usan-las-pruebas.md` (el informe de las 109 piezas).
- **Relacionados:** ADR-0480 (Compras simple: Órdenes de compra sale del menú), ADR-0530 (Pendientes de campaña, que la hace volver a ser necesaria), ADR-0183 y ADR-0515 (costo de la prenda).
- **Origen:** pedido de Felipe, 2026-10-27: «revisa todo el ERP, retira lo que no se use, también en migraciones, cuidando que no se rompa nada de lo actual».

## El problema

Knip ya vigilaba que no naciera código muerto (ADR-0406), pero quedaban **76 piezas** que solo usaban sus pruebas (la deuda de `scripts/knip/deuda-produccion.mjs`), y nadie había mirado lo que Knip no ve: la base, `public/`, `graphify-out/`.

## Lo que se decidió

1. **Se borraron 71 de las 76 piezas de la deuda de Knip**, cada una con su prueba y con los helpers que solo ella usaba (`lib/*-reglas.ts` y afines: facturación, caja-panel, marcas, panel-serie, produccion-menu, etc.). Antes de borrar cada una se comprobó con `git grep` que nadie fuera de su archivo y su prueba la usaba. `lib/registro-contable.ts` se fue entero (la web solo usaba `IGV_TASA`, hoy local a `analisis-rinde.ts`) y `lib/movimientos-atajos.test.ts` también. Las pruebas de lo que sigue vivo se conservaron (en `frescura-dos-relojes.test.ts` se portaron los casos de borde de `tramoDe`).
2. **Quedan 5 en la deuda, a propósito:** `textoDeRepartoParaLector` (es accesibilidad por conectar, no basura), `codigo128` y `puntosPorModuloQR` (solo los usa la hoja de prueba de etiquetas: decide Felipe), `partesPorPagar` (se va con «Mis partes de compras», que lleva migración) y `resolverTienda` (el informe de 2026-10-14 decía que `scripts/terminales/reglas.mjs` tenía su copia: **no es así, la re-exporta**, y `pnpm terminales:crear` la usa; el comentario de la deuda se corrigió).
3. **Peso muerto:** 5 `svg` de la plantilla de Next en `apps/web/public` y las tres instantáneas fechadas de `graphify-out/` (15–17 de septiembre, ~12 MB); el grafo vivo de la raíz se queda.
4. **Base de datos: dos funciones sin llamador, retiradas en la migración `20261028003000`** (`drop function if exists`, sin tocar tablas ni datos): `fn_costo_historial(uuid)` y `ajustar_insumo_por_conteo(uuid, uuid, numeric, text)`. Evidencia (solo lectura, producción, 2026-10-27): existen con esa firma; `pg_depend`, `pg_trigger` y los DEFAULT no las referencian; ninguna función de `retail` ni `public` las nombra por palabra completa; ninguna vista ni política; `pg_stat_statements` no registra llamadas. En el código solo estaban en `packages/database/src/types.ts`, de donde también salen. `fn_costo_historial` era además el pendiente «costo de prendas legible por cualquier colaborador» (ADR-0183): se cierra quitándola, porque la web usa `fn_costo_historial_efectivo`.

## Lo que NO se retiró, y por qué

- **Las pantallas de Órdenes de compra (`/compras/ordenes`, ~5.600 líneas).** Sin entrada de menú desde ADR-0480, pero **el ADR-0530 (2026-10-26) puso ahí la bandeja «Pendientes de campaña»** y el Plan de campaña enlaza a ellas («Ver en Compras»). Retirarlas rompe esa función: decide Felipe.
- **Las tablas y funciones de notas de crédito de proveedor.** ADR-0480 las dejó «por ahora»: «nada se borró». Una función de la base no se borra porque la pantalla se haya retirado si la decisión es «por ahora».
- **`track_functions = none` en producción:** no hay estadística de llamadas por función. Por eso el criterio de la base es «sin ningún llamador ni dependencia» y no «0 llamadas»; solo se retiraron las dos que cumplen todo.
- **Las ~330 funciones que solo llaman las pruebas de `scripts/pruebas/`** son ayudantes internos de otras funciones: no se tocan.
- **Carpetas de `docs/maquetas/` sin referencia por nombre** (10, ~10 MB): son referencia visual; Felipe las mira antes.

## Cómo se verificó

`pnpm knip`, `pnpm knip:produccion` (deuda de 76 a 5), `pnpm typecheck` y la suite completa de `apps/web`. La migración no se probó contra una base local porque solo hace `drop function if exists` de dos funciones sin dependientes; el ensayo en producción espera el OK.

## Qué se rompería si estuviera mal

Una función retirada que alguien llamaba: la llamada fallaría con `42883 function does not exist`. Por eso la migración va **después** de publicar la web de esta rama y se pega con el OK de Felipe; si algo la necesitara, se recrea desde `20260916090000` o `20260917145000`.
