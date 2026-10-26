# ADR-0532 — De quién es lo vendido: CAYLA y CLAURE en Caja y en el Historial de ventas

**Estado:** aceptada · migración `20261026232000` **no está en producción** (espera el OK de Felipe) · **Fecha:** 2026-10-26 · **Decidió:** Felipe ·
**Sigue a:** ADR-0463 (empresas CAYLA y CLAURE) y ADR-0505 (CLAURE solo existe en Lima)

## Contexto

Felipe (2026-10-26): «En la sede de Lima necesito diferenciar en caja y en historial de ventas las ventas que son de CAYLA, o sea, en
dinero a cuánto equivale CAYLA y a cuánto equivale Clauré».

En Tienda LIM los dos negocios venden con la misma caja y la misma boleta (el RUC de CAYLA, ADR-0463). Caja dice «Vendido hoy» y el
Historial «vendido», pero nadie podía decir cuánto de eso era de cada uno sin sumar boleta por boleta. En producción, ese día: 2 ventas
con prendas de CLAURE, ninguna mixta, y en TODAS las ventas las líneas suman lo pagado (ningún descuento de ticket queda fuera de las
líneas), así que repartir por línea es exacto.

## Decisión (Felipe eligió las tres, 2026-10-26)

1. **Se reparte solo lo vendido, no los pagos.** Cada línea de la venta suma a la empresa de su producto (`productos.empresa_id`) por
   lo que se cobró de ella (`venta_items.subtotal`, con sus descuentos ya restados). El efectivo, Yape y tarjeta siguen juntos: es un
   solo cajón y una sola boleta, y partir el pago de una boleta mixta sería una estimación, no un dato.
2. **La cifra es lo vendido** (el precio cobrado), no lo que CAYLA le debe a CLAURE (eso es la liquidación, que lee el costo).
3. **Anulaciones y devoluciones cuentan igual que hoy:** una venta anulada no suma; una devolución o un cambio no restan, como el
   «vendido» de siempre. Las dos empresas se cuentan con la misma regla.

**En la base, dos funciones de solo lectura, ninguna reescrita** (`20261026232000_vendido_por_empresa.sql`):
- `fn_vendido_por_empresa(...)` lleva los mismos filtros y la misma regla de lectura que `fn_totales_historial_ventas`, para que la suma
  de las empresas sea EXACTAMENTE el «vendido» de la cabecera del Historial. Una fila por empresa.
- `fn_vendido_por_empresa_de_cajas(uuid[])` usa la regla de `fn_resumen_caja` (todas las ventas del turno menos las anuladas, también
  las de prueba, porque su dinero estuvo en el cajón). Solo devuelve las cajas que la cuenta puede ver.
- Las dos devuelven la clave y el nombre de la empresa: `empresas` no se lee directo (ADR-0463).

**En la web, una pieza: `<RepartoEmpresas>`** («De quién es lo vendido»): el total, la barra apilada del sistema (CAYLA en tinta,
CLAURE en pizarra como su insignia) y, por empresa, cuánto, qué parte y en cuántas prendas y ventas. Se dibuja en:
- **Caja** (`/caja`), bajo el titular «hoy contra ayer»: lo vendido desde que se abrió la caja.
- **El detalle de cada cierre** (Historial de cierres), sobre «Qué se cobró».
- **Historial de ventas** (`/vender/historial`), sobre la lista: lo vendido en el período y la tienda elegidos. Y cada venta con prendas
  de CLAURE lleva su marca: «CLAURE» si es toda suya, «CLAURE S/ 59.90» si es mixta.

**Cuándo se ve** (`repartoDeEmpresas`, `lib/vendido-por-empresa-reglas.ts`, pura y con prueba): donde conviven dos empresas (Lima, y el
Historial con «Todas las tiendas»), siempre con las dos aunque una vaya en S/ 0 («se está contando»); en Trujillo y Arequipa, nunca
(diría «100 % CAYLA»). Quien no es líder ve las empresas de su propia sede.

## Alternativas descartadas

- **Parchar `fn_totales_historial_ventas` y `fn_resumen_caja` para que devuelvan también el reparto:** son funciones con varios
  reemplazos anclados encima (ADR-0311); un parche más pide su candado de huella y choca con quien las toque. Una función nueva al lado
  es independiente; la prueba compara las dos sumas para que sus filtros no se separen.
- **Partir el efectivo y los demás pagos por empresa en proporción:** descartado por Felipe (es una estimación en una boleta mixta).
- **Calcular el reparto en la web con las filas de la lista:** la lista va paginada y con el tope de 1.000 filas de PostgREST; el total
  del período tiene que sumarlo la base, como ya lo hace la cabecera.
- **Una sola función con un modo «caja» y otro «historial»:** dos reglas distintas (con o sin las de prueba, por fechas o por turno) en
  una firma confusa. Dos funciones chicas.

## Lo que se rompe si…

- **Cambian los filtros de `fn_totales_historial_ventas` y no los de `fn_vendido_por_empresa`:** la suma ya no sería el vendido de la
  cabecera. Lo atrapa `pnpm pruebas:vendido-por-empresa` (compara las dos con ocho combinaciones de filtros y por tienda).
- **Con los filtros que la base no suma** (por enviar, factura, con cliente, con posventa) la cabecera se calcula en la web y el reparto
  **no se muestra**, para no enseñar dos cifras que no coinciden.
- **Se publica la web antes que la migración:** la función no existe, la lectura devuelve `null` y Caja e Historial salen como antes.
- **Llega una venta con descuento de ticket que no baja a las líneas:** el reparto sumaría lo de las líneas y no lo pagado. Hoy no
  existe (verificado en producción); si se agrega, el descuento tiene que repartirse en las líneas al guardar.

## Verificación

- `pnpm pruebas:vendido-por-empresa` (17/17, Postgres local, cada caso en ROLLBACK): en el Historial, la suma por empresa es el vendido
  de `fn_totales_historial_ventas` con 8 combinaciones de filtros y en cada tienda; una prenda pasada a CLAURE suma a CLAURE lo cobrado
  por ella y el total no cambia; en Caja, cada turno suma lo de sus ventas sin anuladas y coincide con lo cobrado de `fn_resumen_caja`;
  sin sesión no se lee; `anon` no ejecuta; aplicarla dos veces es inocuo.
- Web: `lib/vendido-por-empresa-reglas.test.ts` (16 casos) y los 662 archivos de pruebas de la web, tipos, lint y Knip en verde.
- Navegador (local, con la «Blusa Lino Aurora (prueba)», con stock solo en Lima, marcada como CLAURE solo durante la prueba y devuelta a
  CAYLA después): en el Historial de Lima, CAYLA S/ 1,208.80 + CLAURE S/ 29.90 = el vendido de la cabecera, S/ 1,238.70, y su venta lleva
  «CLAURE»; en Caja y en el detalle de un cierre de Lima, la tarjeta cuadra con «Qué se cobró» (S/ 694.30). Historial a 375 px y en modo
  oscuro: se lee y la página no se desborda.
- **No verificado:** producción (la migración espera el OK de Felipe) ni una venta mixta real.
