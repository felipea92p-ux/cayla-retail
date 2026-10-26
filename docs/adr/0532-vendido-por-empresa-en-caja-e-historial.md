# ADR-0532 — En Lima manda la marca: CAYLA y CLAURE en Caja, Historial, Movimientos y el alta

**Estado:** aceptada · migraciones `20261026232000` y `20261026234000` **no están en producción** (esperan el OK de Felipe) · **Fecha:** 2026-10-26 ·
**Decidió:** Felipe · **Sigue a:** ADR-0463 (empresas CAYLA y CLAURE) y ADR-0505 (CLAURE solo existe en Lima)

## Contexto

Felipe, 2026-10-26, en dos mensajes:

1. «En la sede de Lima necesito diferenciar en caja y en historial de ventas las ventas que son de CAYLA, o sea, en dinero a cuánto
   equivale CAYLA y a cuánto equivale Clauré».
2. «Todo lo que se registre en Tienda Lima y no sea de la marca CAYLA automáticamente pasa a ser Clauré, sin importar si son los mismos
   productos de otras tiendas de CAYLA. Si se registra stock en Lima es de Clauré. Solo se diferencia por marca CAYLA las prendas CAYLA.
   También añade un filtro para ver las ventas de Clauré y las de CAYLA por separado en Movimientos».

En Tienda LIM los dos negocios venden con la misma caja y la misma boleta (el RUC de CAYLA). Hasta hoy la empresa era un dato fijo de
cada prenda (`productos.empresa_id`), elegido en el alta. En producción, ese día, había 11 prendas de otras marcas (Strend, Krisstell,
Lasak…) con stock en Lima marcadas CAYLA, y 10 de ellas también tenían stock en Trujillo, Arequipa o el Taller. Además, las líneas de
todas las ventas sumaban lo pagado (ningún descuento de ticket fuera de las líneas): repartir por línea es exacto.

## Decisión

**1. La regla de quién es cada prenda (Felipe eligió «por sede y marca»).** En una sede donde operan dos empresas (hoy solo Tienda LIM,
`empresa_sedes`), la prenda es de la empresa dueña de su marca: la marca CAYLA es de CAYLA (`empresas.marca_id`). Cualquier otra marca,
o sin marca, es de la otra empresa de la sede: CLAURE. **Una blusa Strend que también está en Trujillo, vendida en Lima, es de CLAURE.**
En las demás sedes manda el dato de la prenda: todo es CAYLA (CLAURE no sale de Lima, ADR-0505). Si la base no sabe cuál es la marca
de CAYLA, la regla se apaga y manda el dato de la prenda: nunca se pasa a CLAURE lo de la marca CAYLA por un dato que falta.
- En la base es una función, `fn_empresa_de_prenda_en_sede(producto, sede)`; en la web, su espejo `empresaPorMarca`
  (`lib/empresas-de-sede-reglas.ts`). Si una cambia, cambia la otra.
- `empresas.marca_id` se sembró por el nombre una sola vez (había exactamente una marca «CAYLA» en producción y en local); después se
  lee por id, así que renombrar la marca no rompe nada.

**2. El dinero: se reparte solo lo vendido, a precio cobrado, sin tocar anulaciones ni devoluciones** (las tres, elegidas por Felipe).
Cada línea suma a la empresa de su prenda EN LA SEDE DE LA VENTA por lo que se cobró de ella (`venta_items.subtotal`). El cajón no se
parte por medio de pago (es uno solo y una sola boleta). Una venta anulada no suma; una devolución o un cambio no restan, como el
«vendido» de siempre. No es lo que CAYLA le debe a CLAURE (eso es la liquidación, a costo).

**3. El alta en Lima ya no pregunta** (Felipe eligió «la decide la marca»): «¿De qué tienda es esta prenda?» desaparece y la empresa
sale de la marca elegida; la ficha de la derecha la muestra («CLAURE · …» hasta que se elige la marca CAYLA). Una prenda nueva de otra
marca nace CLAURE y, por ADR-0505, no sale de Lima. Solo si la base no dice cuál es la marca de CAYLA, se vuelve a preguntar.

**En la base** (ninguna función viva se reescribe desde un archivo):
- `20261026232000`: `empresas.marca_id`, `fn_marcas_de_empresas()`, `fn_empresa_de_prenda_en_sede`, y tres lecturas: `fn_vendido_por_empresa`
  (los mismos filtros y regla de lectura que `fn_totales_historial_ventas`: su suma es el «vendido» de la cabecera), `fn_vendido_por_empresa_de_cajas`
  (la regla de `fn_resumen_caja`, por turno) y `fn_empresa_de_ventas` (cuánto de cada venta es de cada empresa).
- `20261026234000`: `fn_movimientos` y `fn_movimientos_resumen_procesos` ganan `p_empresa_id` por reemplazo anclado con candado de huella
  (huellas «antes» iguales en producción y en local, leídas el 2026-10-26). Se borra la firma vieja en la misma transacción.

**En la web:**
- `<RepartoEmpresas>` («De quién es lo vendido»: total, barra apilada del sistema con CAYLA en tinta y CLAURE en pizarra, y por empresa
  cuánto, qué parte y en cuántas prendas y ventas) en **Caja** (desde que se abrió la caja), el **detalle de cada cierre** y el
  **Historial de ventas** (el período y la tienda elegidos). En el Historial, cada venta con prendas de CLAURE lleva «CLAURE» o, si es
  mixta, «CLAURE S/ 59.90».
- **Movimientos**: la fila «Tienda · Todas · CAYLA · CLAURE» junto a «Zona» (`?emp=`), que filtra la lista, las cifras y la descarga.
- **Vender y los demás que ofrecen el catálogo de la sede**: la insignia «CLAURE» sigue la misma regla (en Lima, la blusa Strend la lleva).
  Qué se OFRECE en cada sede sigue mandándolo el dato de la prenda (ADR-0505).
- Todo se ve solo donde conviven dos empresas (Lima, y el Historial con «Todas las tiendas»); en Trujillo y Arequipa, nada.

## Alternativas descartadas

- **Solo las prendas nuevas de Lima, por prenda** (la otra opción que vio Felipe): las 11 prendas compartidas seguirían como CAYLA en
  Lima. Felipe pidió lo contrario: «sin importar si son los mismos productos de otras tiendas de CAYLA».
- **Pasar las 11 prendas compartidas a CLAURE en `productos.empresa_id`:** el candado de ADR-0505 lo rechaza (tienen stock fuera de Lima),
  y en Trujillo dejarían de venderse. La empresa en Lima es de la sede y la marca, no un dato fijo de la prenda.
- **Reconocer la marca CAYLA por su nombre en cada consulta:** un renombre la rompería en silencio. Se guarda el id en `empresas.marca_id`.
- **Parchar `fn_totales_historial_ventas` y `fn_resumen_caja`** para el reparto: funciones con varios parches encima (ADR-0311); una lectura
  nueva al lado es independiente y la prueba compara las dos sumas. (Movimientos sí se parcha: su lista va paginada en la base y un
  filtro fuera de ella haría mentir a la página).
- **Partir el efectivo y los pagos por empresa:** descartado por Felipe (sería una estimación en una boleta mixta).

## Consecuencias de negocio (para que Felipe las tenga a la vista)

- Una prenda de otra marca que se traslada de Trujillo a Lima, al venderse en Lima, cuenta como CLAURE. Si vuelve a Trujillo, cuenta como CAYLA.
- La «Prenda sin registrar» (la que se vende sin ficha) es de marca CAYLA en producción: vendida en Lima cuenta como CAYLA.
- Las etiquetas de precio, el filtro «Tienda» de Catálogo ▸ Productos y la tienda online siguen leyendo `productos.empresa_id`: una blusa
  Strend compartida se imprime como CAYLA aunque en Lima su dinero sea de CLAURE (ver el backlog).

## Lo que se rompe si…

- **Cambian los filtros de `fn_totales_historial_ventas` y no los de `fn_vendido_por_empresa`:** la suma ya no es el vendido de la cabecera.
  Lo atrapa `pnpm pruebas:vendido-por-empresa`.
- **Con los filtros que la base no suma** (por enviar, factura, con cliente, con posventa), el reparto del Historial no se muestra.
- **Alguien cambia `fn_movimientos` o su resumen** sobre la versión anterior: esta migración aborta por la huella y hay que rehacer el parche.
- **Se borra la marca CAYLA o se vacía `empresas.marca_id`:** la regla se apaga (manda el dato de la prenda) y el alta vuelve a preguntar.
- **Se publica la web antes que las migraciones:** sin las funciones, Caja, Historial y Movimientos salen como antes (sin reparto ni filtro;
  el filtro `?emp=` no se manda porque la marca de la empresa no se pudo leer). El alta pregunta, como antes.

## Verificación

- `pnpm pruebas:vendido-por-empresa` (26/26, Postgres local, cada caso en ROLLBACK): la regla en Lima, en Trujillo y sin la marca de la casa;
  la suma por empresa contra `fn_totales_historial_ventas` con 8 combinaciones de filtros y por tienda; CLAURE = lo vendido en Lima que no es
  marca CAYLA; en Trujillo, todo CAYLA; cada venta suma su total; en Movimientos, CAYLA + CLAURE = sin filtro en la lista (todas y ventas) y
  en las cifras grupo por grupo, y en Trujillo CLAURE da 0; una firma de cada función; Caja contra `fn_resumen_caja`; permisos; dos pasadas.
- Web: `lib/vendido-por-empresa-reglas.test.ts` (16) y `lib/empresas-de-sede-reglas.test.ts` (19, con `empresaPorMarca`), los 662 archivos de
  la web, tipos, lint, Knip y las guías (pasos nuevos en Caja, Historial y Movimientos; huella de Movimientos aceptada).
- Navegador (local; el «Pantalón Carla», con stock en Lima y en Trujillo, sin marca solo durante la prueba y devuelto después): Movimientos de
  Lima con «Ventas» + «CLAURE» muestra solo su venta (1 operación); el Historial de Lima da CAYLA S/ 1,138.80 + CLAURE S/ 99.90 = el vendido de
  la cabecera, S/ 1,238.70, y la venta mixta lleva «CLAURE S/ 99.90»; Nuevo producto en Lima ya no pregunta la tienda y la ficha dice «CLAURE»
  hasta elegir la marca. Antes (primer mensaje): Caja y el detalle de un cierre cuadran con «Qué se cobró»; Historial a 375 px y en oscuro.
- **No verificado:** producción (esperan el OK de Felipe), un alta completa de punta a punta y la insignia de Vender con una copia nueva del catálogo.
