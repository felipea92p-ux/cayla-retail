# ADR-0050 — La categoría de un movimiento es una proyección de lectura, no un 5.º `tipo`

**Fecha:** 2026-09-15
**Estado:** Aplicado en la base local (`20260915090000_movimientos_lectura.sql`).
**No aplicado en producción** — la pega Felipe (D-11); ya lleva el prefijo `retail.`.
Hasta entonces, el diccionario de `docs/datos/` no se regenera.
**Afecta:** funciones nuevas `retail.fn_movimientos`, `retail.fn_movimientos_resumen`,
`retail.fn_movimientos_variantes` (privada); dos índices sobre `retail.movimientos`;
`apps/web/lib/movimientos-reglas.ts`, `movimientos-v2.ts`, `cargo-especial.ts`;
`app/(app)/movimientos/page.tsx`, `FiltrosMovimientos.tsx`, `MovimientosLista.tsx`,
`MovimientoDetalle.tsx`, `Paginacion.tsx` (generalizado), `ui/Tabla.tsx` (`desdeLg`),
`inventario-v2.ts` y `app/(app)/page.tsx` (excluyen la variante centinela).
**Ninguna tabla cambia. Ninguna escritura cambia.**

## Contexto

Felipe pidió que Movimientos responda «qué cambió, cuánto, dónde, por qué, quién, desde
qué proceso y de dónde hacia dónde», con cinco tipos visibles (ENTRADA, SALIDA, INTERNO,
AJUSTE, TRANSFERENCIA), búsqueda, filtros y detalle — y que antes de tocar nada se
validara qué de eso ya existía.

La auditoría dio que **el modelo ya lo tiene todo**: `retail.movimientos` guarda `tipo`
(4 valores), `motivo` (el proceso: recepcion/venta/transferencia/movimiento_interno/
devolucion/cambio/conteo, más `carga_inicial`, `activacion_piso_almacen` y
`siembra_cargo_especial` como cargas de sistema), sububicación origen y destino, usuario,
nota y una FK a cada proceso. Es inmutable por trigger (ADR-0042). Lo que faltaba era
**leerlo**: la pantalla usaba embeds de PostgREST sobre los últimos 100 y filtraba en
memoria — sin búsqueda, sin filtros, sin detalle, sin el nombre de la persona (vive en
`public.personas`, otro schema) y con un bug: pintaba «−» en todo `traslado`, incluidos los
que ENTRAN a la ubicación.

## Decisión

1. **Cinco categorías en pantalla, cuatro `tipo` en la base.** `interno` y
   `transferencia` son ambos `tipo = 'traslado'`; los distingue `ubicacion_id =
   ubicacion_destino_id`. La categoría se calcula UNA vez, en SQL, dentro de
   `fn_movimientos` — TypeScript solo etiqueta y colorea. Lo mismo el `delta`: el efecto
   sobre la ubicación que se mira (+ entra, − sale, 0 interno, ajuste con su signo).
2. **Una función de lectura, no embeds.** `fn_movimientos(p_ubicacion_id, …)` devuelve
   una fila plana por movimiento con todos los joins resueltos (variante, ubicaciones,
   sububicaciones, persona, comprobante, lote+proveedor, factura de compra,
   transferencia, conteo, devolución, cambio), filtros server-side y cursor
   `(created_at, id)` con `limite + 1` — el patrón de `listar_compras`.
   `fn_movimientos_resumen` da los totales por categoría del mismo filtro, sin cursor.
3. **`security definer` con barandas**, no `security invoker`: el nombre de la persona
   está en otro schema; con invoker la pantalla daría nombres en local (el stub da
   `select`) y NULL en producción. Barandas: `p_ubicacion_id` obligatorio y validado con
   `fn_puede_operar_ubicacion` (con NULL devolvería TRUE para una Líder), toda fila cumple
   `ubicacion_id = p or ubicacion_destino_id = p` (reproduce `movimientos_select`), de
   personas solo `nombres || ' ' || apellidos`, `revoke all from public`.
4. **La variante centinela «Cargo especial» se excluye por constante** en
   `fn_movimientos`, `fn_movimientos_resumen`, `getStockPorUbicacion` (Inventario y
   Vender) y el conteo de unidades de Inicio. Por id (`lib/cargo-especial.ts`), no por
   `variantes.activo`: las prendas descontinuadas también están en `false` y su historial
   sí debe verse. Decisión de Felipe: «contamina el ledger, excluye todo registro
   innecesario».
5. **Sin funciones de edición ni borrado.** Ya está prohibido por trigger; un movimiento
   se corrige con el proceso de negocio (devolución, conteo). No se toca.

## Alternativas descartadas

- **Agregar `tipo = 'interno'` a la tabla.** Es lo que pedía el enunciado leído literal.
  Costo: `fn_aplicar_movimiento` y `recalcular_stock` ganarían una rama nueva para un
  dato que ya está en las columnas (`ubicacion_id = ubicacion_destino_id`) — la clase de
  bug de ADR-0031 (dos caminos para el mismo hecho). Un dato derivable no se guarda.
- **Seguir con embeds + filtrar en memoria.** No puede joinear `public.personas`, no
  puede derivar categoría/signo, y «la venta de hace tres semanas por SKU» es imposible
  sobre los últimos 100.
- **Borrar la centinela y sus movimientos.** Imposible por diseño (ledger inmutable, FKs
  desde `venta_items`) y rompería «Monto manual» del POS. Se excluye al leer.
- **Detalle como ruta interceptada (URL compartible).** Compras acaba de pagar un bug
  real con ese patrón y el pedido pide modal; queda como siguiente mejora.

## Consecuencias

- El signo de las transferencias es correcto desde la ubicación que se mira: Taller ve
  `−6`, Tienda Lima ve `+6` para la misma fila.
- Un motivo que la pantalla no conozca se muestra tal cual (`ajuste manual 2027`),
  nunca rompe. Los tres motivos de sistema de producción tienen nombre propio y chip
  «Sistema».
- Medido en local con 165.000 filas sintéticas (transacción revertida): ~30 ms por
  página. El predicado `OR` sobre dos columnas entra por BitmapOr sobre los índices
  nuevos y ordena solo lo de esa ubicación. Si CAYLA multiplica por 10 ese volumen, el
  paso conocido es partir el OR en dos ramas `union all` con `limit` — no hoy.
- **Se rompe si** alguien recrea `fn_movimientos` sin el `raise` de `p_ubicacion_id is
  null`: una Líder vería todas las ubicaciones «por accidente» y una colaboradora, nada
  — sin error, en silencio.
