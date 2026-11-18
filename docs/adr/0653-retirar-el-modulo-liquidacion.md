# ADR-0653 — Catálogo ▸ Liquidación se retira: nunca se usó y se confunde con «Para liquidar»

**Fecha:** 2026-11-13 · **Estado:** aceptado por Felipe. **Reemplaza a ADR-0379.** La web se retira en este PR; la migración
`20261113174000_retirar_modulo_liquidacion.sql` está escrita y probada en local, **sin pegar en producción** (espera el OK de Felipe).

## Contexto

ADR-0379 (2026-10-10) creó Catálogo ▸ Liquidación: etiquetar las prendas sueltas que nunca entraron al catálogo con un código `LQ`,
bajarles el precio con una etiqueta nueva y venderlas en la caja escaneándolas, sin tocar `stock` ni `movimientos`.

Un mes después no tiene uso. El volcado de producción del 2026-11-12 (`docs/datos/generado/retail_filas.json`) dice
`piezas_liquidacion: 0` y `piezas_liquidacion_etiquetas: 0`; `parametros_liquidacion` tiene su única fila de siempre (S/ 10).
**Confirmado en vivo el 2026-11-13** (Felipe, SQL Editor, solo lectura): 0 piezas, 0 etiquetas, 0 líneas en `actividad`, 0 roles con
Liquidación de pantalla principal y 0 ocultos a un líder. **Un rol la tenía asignada: «Compras»** (nunca la usó); la migración se la quita. Y el
nombre confunde: «Liquidación» suena a la insignia «Para liquidar», que sí rebaja prendas del catálogo. En la sesión de diseño de
«Campañas y ofertas», Felipe ordenó el catálogo así: una **insignia** dice qué es la prenda (nunca cambia el precio), una **campaña** es
la fecha especial y una **oferta** es lo que el cliente paga de menos, siempre dentro de una campaña. «Para liquidar» pasa a ser una
campaña sin fecha de fin. Un módulo aparte que también «liquida», pero con prendas fuera del catálogo, no cabe en ese orden.

Felipe (2026-11-13): «Hay que eliminar la opción o el módulo "liquidacion": nunca se ha usado y solo causa confusión».

## Decisión

1. **La web se retira entera:** la ruta `/productos/liquidacion`, sus seis componentes (`components/liquidacion/`), sus reglas, su guía
   de foco, su guía interactiva y su huella, sus estilos (`estilos/liquidacion.css`), su fila del menú y su ícono, y su clave en
   `CLAVES_MODULO`/`MODULOS`. **Vender ya no lee una etiqueta `LQ`:** un código así se busca como cualquier otro y sale «No encontramos
   …». El ticket pierde lo que solo servía a la pieza (`liquidacion` en la línea, la venta final, el bloqueo con el regalo del club y
   sin conexión, `pieza_liquidacion_codigo` en el envío).
2. **El módulo sale del catálogo como «Notas de crédito» (ADR-0480):** la migración quita sus asignaciones (`lider_modulos_ocultos`,
   `rol_modulos`: configuración, no historia) y su fila de `modulos`. **Se detiene sin hacer nada** si Liquidación tiene historia: una
   pieza, una etiqueta, una línea en `actividad` o un rol que la tenga de pantalla principal.
3. **La base no se borra: queda quieta.** Las tres tablas y las trece funciones de ADR-0379 siguen ahí, con un comentario de
   «RETIRADA». A las seis que llamaba la web (`crear_pieza_liquidacion`, `cambiar_precio_pieza_liquidacion`, `retirar_pieza_liquidacion`,
   `guardar_precio_minimo_liquidacion`, `fn_pieza_liquidacion`, `fn_piezas_liquidacion`) se les quita el permiso de ejecutar para
   `public`, `anon` y `authenticated`: nadie puede etiquetar una pieza llamando a la función a mano.
4. **`registrar_venta` no se toca.** Sus dos reemplazos anclados (`fn_validar_linea_liquidacion`, `fn_vender_pieza_liquidacion`) solo
   se activan con una línea que trae `pieza_liquidacion_codigo`. La web ya no la manda; si alguien la mandara a mano, no hay etiqueta y
   la venta se rechaza con `liquidacion_no_existe`, sin escribir nada. Los tres disparadores (`trg_cambios_liquidacion_venta_final`,
   `trg_devolucion_items_liquidacion_venta_final`, `trg_piezas_liquidacion_al_anular`) tampoco: sin piezas, nunca encuentran nada.

## Alternativas descartadas

- **Borrar tablas y funciones (`drop`).** La regla del repo es no borrar lo construido, y aquí no gana nada: vacías y sin permiso no
  cuestan. Además, `drop function fn_validar_linea_liquidacion` rompería `registrar_venta`, que la llama.
- **Reescribir `registrar_venta` sin sus dos ramas.** Es la función que cobra en las tres tiendas; reescribirla (desde su definición viva,
  `pg_get_functiondef`) para quitar dos `if` que ya nunca entran arriesga las ventas a cambio de nada. Si algún día se reescribe por
  otro motivo, se pueden quitar entonces.
- **Dejar el módulo y solo esconder la fila del menú.** Seguiría en Roles y accesos, sin pantalla: la misma confusión, en otro lugar.

## Lo que queda a propósito

- `--papel-en-bandeja-sombra` en `app/estilos/vidrio/recetas.css` se queda sin uso (solo la usaba `estilos/liquidacion.css`). No se
  quita aquí porque `recetas.css` viaja solo a CAYLA Dynamic y quitar una variable abre una tarea allá (contrato de familia v4): se
  quita en una pasada coordinada.
- `packages/database/src/types.ts` sigue con las seis funciones: son tipos generados de la base, y las funciones existen.
- `scripts/chaos/invariantes.mjs` sigue mirando que una pieza tenga una sola etiqueta vigente: con las tablas vacías, pasa sola.
- Los ADR, bitácoras, maquetas y tableros (`docs/formidable/`, `docs/chaos/`) quedan como historia, marcados donde hace falta.

## Se rompe si

- **Se pega la migración antes de publicar la web.** La web de hoy pide el módulo (`exigirModulo("liquidacion")`) y Vender llama a
  `fn_pieza_liquidacion`: sin permiso, escanear un `LQ` daría «No se pudo leer la etiqueta». Orden: primero se publica la web, después
  se pega la migración.
- **Alguien le devuelve a una función el `grant` sin devolver la pantalla**: volvería a poder etiquetar piezas que nadie ve.

## Cómo se vuelve

Si algún día se quiere de vuelta: la fila de `modulos` (la de `20261010195000_piezas_de_liquidacion.sql`), los seis `grant execute … to
authenticated` y la web de antes de este PR (git la guarda). Los datos no se tocaron, así que no hay nada que recuperar.

## Cómo se verifica

- `pnpm pruebas:liquidacion-retirada` (reemplaza a `pruebas:piezas-liquidacion`, también en el CI): el módulo no está en el catálogo ni
  en un rol, `authenticated` no ejecuta ninguna de las seis, las tablas siguen ahí, un código `LQ` mandado a mano se rechaza y una venta
  normal sigue entrando y moviendo su stock. Antes de aplicarla, `PRUEBA_CON_MIGRACION=<archivo>` la corre dentro de cada transacción.
- Antes de pegar en producción, de solo lectura:
  `select (select count(*) from retail.piezas_liquidacion), (select count(*) from retail.piezas_liquidacion_etiquetas),
  (select count(*) from retail.actividad where modulo = 'liquidacion'), (select count(*) from retail.rol_modulos where modulo =
  'liquidacion'), (select count(*) from retail.roles where pantalla_principal = 'liquidacion');` — si algo no es 0, se para y se le
  avisa a Felipe. La migración se detiene sola si hay piezas, etiquetas, actividad o una pantalla principal; las asignaciones de rol
  las quita, pero Felipe tiene que saber antes a qué roles se les quita.
- Vitest: `modulos.test.ts` (el catálogo de la web es el de las migraciones), `menu.test.ts`, `actividad-reglas.test.ts`,
  `guias.test.ts`, `guia-de-foco.test.ts`, `ticket-linea-reglas`, `vender-reglas`, `descuento-cuenta-reglas`; `pnpm knip` y
  `pnpm knip:produccion`.
