# ADR-0192 — Vender sin recargar la caja entera y los topes silenciosos de 1.000 filas en RPC

- **Fecha:** 2026-09-23
- **Estado:** construido y probado en local. **Sin migración**: solo web. Depende de la etapa 1 (PR #373, ADR-0188).
- **Contexto:** etapa 4 de 5 de la auditoría de concurrencia y volumen (Felipe, 2026-09-23: «que funcione con varios
  usuarios en simultáneo y sea escalable»). Sigue la regla de `docs/BACKLOG.md` «🩹 Velocidad…»: una lectura que puede
  pasar de 1.000 filas va con `leerTodas()` y un orden que no repita.

## Problema

1. **Cada venta recargaba la caja entera.** `PuntoDeVenta` terminaba cada cobro con `router.refresh()`, que vuelve a
   ejecutar `vender/page.tsx` completa: versión del catálogo, `fn_stock_por_sede_json` (la red, ~2.900 filas),
   `getDisponibleEnSede` (~2.300), campañas, categorías, tallas, colores, ejes y ventas del día — ~10 viajes y ~1 MB por
   venta, por caja. Con 3 tiendas cobrando a la vez, la base recalculaba el stock de toda la red por cada boleta. Lo mismo
   al subir la cola sin conexión.
2. **Topes silenciosos.** PostgREST corta también las RPC en 1.000 filas, sin error. Siete lecturas no lo contemplaban:
   las recepciones recientes (`getRecepcionesRecientes`, movimientos de 30 lotes), `fn_lineas_comprobantes_produccion`,
   `listar_apartados`, `fn_deuda_consolidada`, `fn_historial_producto_cambios`, `getModelosProducibles`, y
   `fn_comprobantes_produccion` con `p_limite: 500` fijo — con lo que **Por pagar de Producción sumaba el saldo solo de
   los 500 comprobantes más recientes**. `buscar_separaciones` tiene su propio `limit 200` dentro de la función.

## Decisión

### 1. Tras vender: descontar en pantalla y releer solo lo vendido

- Al cobrar, la pantalla descuenta el carrito de su stock de inmediato (`descontarVendido`) y relee de la base **solo**
  esas prendas en esta sede: la misma lectura de `stock` que `getDisponibleEnSede`, con `.in("variante_id", …)` (RLS ya
  la permite; un GET no enciende el loader). La cifra final es la de la base. Lógica pura en `lib/vender-stock-local.ts`.
- «Ventas de hoy» pasa a `VentasDeHoyLista` (cliente): la primera lectura la hace el servidor como antes, y tras cada
  venta se relee sola con `fn_ventas_del_dia` (prefijo `fn_`: lectura, sin loader). Un contexto (`VersionVentasDeHoy`) le
  avisa, porque la lista llega a la caja como `ReactNode` armado por el servidor.
- La cola sin conexión sigue igual (overlay por encima del stock ajustado); al subir una venta, entra por el mismo
  camino que un cobro en línea, sin `router.refresh()`.
- Cobrar una proforma sigue con `router.replace("/vender")` (hay que quitar `?proforma=` de la dirección; es raro).
- Abrir/cerrar caja siguen refrescando: el servidor manda un catálogo nuevo y los ajustes locales se descartan.
- **Otra caja vende la misma prenda:** esta pantalla no se entera hasta la próxima carga o hasta vender esa prenda.
  Quien lo defiende es `registrar_venta` (candado + `check (cantidad >= 0)`). Al recibir «Stock insuficiente» la caja
  ahora **relee las prendas del ticket antes de avisar**, así el mensaje dice cuántas quedan de verdad
  («Polo… — quedan 0») y la grilla queda al día.

Descartado: una RPC nueva `fn_disponible_variantes`. La lectura directa de `stock` ya da lo mismo con RLS, sin migración.

### 2. Topes: caso por caso

`leerTodas()` gana la opción `{ enParalelo: 1 }`: cada página de una RPC **recalcula la función entera**, así que para
las que casi siempre caben en una página se pide en serie (la 2.ª solo si la 1.ª vino llena): el mismo costo que hoy, y
correctas el día que pasen de 1.000.

| Lectura | Decisión | Orden único |
|---|---|---|
| `getRecepcionesRecientes` (movimientos de 30 lotes) | `leerTodas` (tabla, en paralelo) | `created_at, id` |
| `fn_lineas_comprobantes_produccion` | `leerTodas` en serie | el de la función + `item_id` |
| `listar_apartados` | `leerTodas` en serie | `vence_el, created_at, id` |
| `fn_deuda_consolidada` | `leerTodas` en serie | `saldo desc, origen, proveedor_id` |
| `fn_historial_producto_cambios` | `leerTodas` en serie (un cambio de precio masivo escribe una fila por variante) | `created_at desc, id` |
| `fn_comprobantes_produccion` | `p_limite: 1.000.000` (la función exige uno) + `leerTodas` en serie | `fecha_emision desc, created_at desc, id` |
| `getModelosProducibles` | `leerTodas` (tabla) | `referencia, id` |
| `buscar_separaciones` (tope 200 en la función) | **avisar «hay más»**: la lista es el trabajo del mostrador, no un archivo; las cifras salen de `resumen_separaciones`, que cuenta todo. Con 200 filas, una línea en la franja de avisos lo dice | — |

## Verificación

- `lib/vender-stock-local.test.ts` (4) y `lib/resultado.test.ts` (+1: en serie); suite web 24.349/24.349, `tsc` y
  `eslint` limpios, `next build --webpack` compila.
- Contra el Postgres local, como líder por PostgREST: cada lectura nueva devuelve las mismas filas que la anterior
  (huellas iguales; en el historial cambia solo el orden entre empates de `created_at`, mismo conjunto). La relectura de
  5 prendas de Trujillo da exactamente las filas de esas prendas dentro de la lectura entera de la sede.
- Con ROLLBACK: 1.508 cambios de un producto (1.500 con el mismo `created_at`, el peor caso de empates) leídos en dos
  páginas de 1.000 con `created_at desc, id` → 1.508 filas, 1.508 distintas, 0 faltan.
- No verificado con clics: la sesión de navegador del worktree no tiene usuario (no se escriben contraseñas).
