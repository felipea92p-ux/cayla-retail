# ADR-0557 — «Ver el valor a costo» en Existencias: una función de lectura en la base y la cifra a un toque

**Estado:** aceptada · las 4 actividades construidas · migración `20261028211000` (por pegar en producción) · **Fecha:** 2026-10-28 · **Decidió:** Felipe (opciones A / líder + dinero de Compras / CLAURE aparte)

## Contexto

Felipe preguntó dónde ve el valor de su inventario. Hoy solo está en **Finanzas ▸ Reportes ▸ Balance**, en la fila «Mercadería» de cada tienda
(`fn_bal_stock`, stock × costo). Ese número no sirve para Existencias por cuatro razones medidas en el código:

- **La puerta es de Finanzas** (`fn_ve_finanzas_de_todo` o Reportes financieros) y `fn_balance_por_tienda` calcula además la caja, los activos y
  el estado de resultados del mes en cada llamada.
- **Una prenda sin costo vale S/ 0 sin aviso** (`variantes.costo` es `NOT NULL default 0`).
- **Suma lo dañado al costo completo** y **cuenta las unidades de CLAURE como mercadería de CAYLA** (`fn_bal_stock` no mira `stock_dueno`, ADR-0542).
- **Casi todo el costo es el que se escribió al dar de alta la prenda**, no el de una factura: en el volcado de producción del 26-oct,
  `costo_historial` tiene 24 filas y `compra_items`, 0, para 2.697 variantes. Un total que parece firme sin serlo es peor que no tenerlo
  (ADR-0121 D9; ADR-0243).

## Decisión

**1. Una función de lectura nueva, liviana y con su puerta en la base** (`fn_valor_inventario_existencias()`): una fila por sede con unidades, valor,
unidades y tallas sin costo, cuánto del valor viene de una compra o de Producción, y lo dañado y lo de CLAURE aparte. Quien llama es líder (ve todas
las sedes) o pasa `fn_puede_ver_dinero_de_compras()` (ve solo la suya, como Existencias). **Sin permiso devuelve CERO filas**, nunca una fila en cero.
El costo de cada prenda no sale de la base: solo las sumas (ADR-0183).

**2. Qué cuenta** — lo mismo que Existencias: variantes activas de productos que no son de prueba, sin la centinela del «Monto manual»
(`2222…`, 999.999 unidades). Lo dañado (sububicación `cuarentena`) y lo de CLAURE (`stock_dueno`) van **aparte** y no entran al valor de CAYLA. Una
prenda con costo 0 no suma y **se cuenta** («8 prendas (3 tallas) sin costo: no cuentan en este valor»), a la vista y no solo al pasar el mouse.

**3. «Ver cuáles»** (`fn_tallas_sin_costo(sede)`): un jsonb `{total, filas}` con las tallas sin costo (modelo, color, talla, unidades; hasta 200), con
las mismas reglas, puerta y sede. La tarjeta lo pide al tocar y lista hasta 20; quien edita el catálogo tiene «Poner costo» al modelo.

**4. En pantalla**: un enlace «Ver el valor a costo» a un toque, como «Ver el capital en insumos» del Taller (`InsumosPanel`). Dice la cifra de la sede
abierta y, al líder, el total y lo que aporta cada sede; el porcentaje que viene de una compra se calcula del dato (no es una frase fija); y
«¿Por qué no es el de Finanzas?» a un toque.

## Qué cambia respecto del Balance (escrito, no escondido)

Existencias **no incluye** lo que va en camino entre sedes ni lo facturado por recibir (cuenta 201), **no descuenta** lo vendido por la web que aún no se
entrega (ADR-0408), **deja fuera** lo dañado y lo de CLAURE, y **no cuenta** variantes inactivas ni productos de prueba. La prueba de Postgres fija la
relación: lo que sube `fn_bal_stock` es exactamente `valor + dañado + CLAURE` de esta función.

DECIDÍ: una función propia, partiendo del stock físico y no de `fn_bal_stock`.
DESCARTÉ: reutilizar `fn_balance_por_tienda` (permiso de Finanzas y un estado de resultados por visita), y sumar en el navegador (viajarían ~1.000 costos,
justo lo que se cerró el 23-sep, y PostgREST corta en 1.000 filas sin avisar).
SE ROMPE SI: alguien reescribe `fn_bal_stock` desde su archivo original (se pierden los parches de pedidos web de `20261015053000` y `20261015115000`) y
espera que esta cifra siga cuadrando con ella; o si una sede llega a miles de tallas sin costo (la lista corta en 200 y lo dice).

## Lo que NO se hizo, a propósito

- **«Ver cuáles» no filtra la lista de Existencias.** Se midió: sumar «Sin costo» a «Condición» tocaba ocho archivos del modelo de filtros (chips,
  conteos, estado vacío, panel, tarjetas rápidas) y no funcionaba en el Taller, que no separa piso y almacén. La lista dentro de la tarjeta llega al
  mismo lugar. Si Felipe prefiere el filtro, es una actividad aparte.
- **No se tocó el Balance.** Que cuente a CLAURE como de CAYLA es una decisión contable (¿activo con deuda por liquidar, o consignación?) que va
  aparte, antes del cierre de octubre.
- **No se separa el IGV.** El costo promedio mezcla boletas (con IGV) y facturas (sin IGV, ADR-0120 / ADR-0035): el total hereda esa mezcla.

## Pendiente de Felipe

1. **Pegar `supabase/migrations/20261028211000_valor_inventario_existencias.sql` en producción** (una sola parte: dos funciones y su permiso, sin
   políticas ni `alter`) **DESPUÉS de `20261027222000` y `20261028153000` (ADR-0542)**: las funciones leen `retail.stock_dueno`, y sin esa tabla el
   pegado falla con `42P01` y no se aplica nada. Hasta entonces el enlace no aparece (la pantalla calla si la función no existe).
2. **Confirmar quién la ve.** Se eligió «líder + quien ve el dinero de Compras». La migración `20261022225000` dice que la Terminal Almacén tiene
   Facturas de compra y Por pagar: si es así, **la terminal de almacén la verá en su sede**. No se verificó en producción (lectura denegada).
   Revisar en Colaboradores ▸ Roles y accesos.

Archivos: `supabase/migrations/20261028211000_valor_inventario_existencias.sql`, `apps/web/lib/valor-inventario.ts`,
`apps/web/lib/valor-inventario-reglas.ts`, `apps/web/components/existencias/ValorInventarioExistencias.tsx`,
`scripts/pruebas/valor_inventario_existencias.mjs` (`pnpm pruebas:valor-inventario-existencias`, 25 casos con mutación de las reglas).
