# ADR-0521 — Proveedores: la lista de Mercadería es un ranking

- **Fecha:** 2026-10-26 · **Estado:** construido, probado y **con sus tres migraciones en producción** (2026-10-26, con el OK de Felipe:
  «Pégalas tú»; aplicadas por el MCP de Supabase con `apply_migration`, que las registra con la hora de aplicación y no con la del archivo:
  `20261026172000` → `20261026202433`, `20261026193000` → `20261026202502`, `20261026194000` → `20261026202626`). Ver «Producción» al final.
- **Relacionados:** ADR-0502 (lo que le compré y lo que vendí: de ahí salen las cifras), ADR-0136 (movimiento), ADR-0358 (una función,
  una pieza), ADR-0389 (guías), ADR-0462 (ancho completo), ADR-0479 (la isla de abajo), ADR-0336 (modo oscuro).
- **Maqueta elegida:** `docs/maquetas/proveedores-v5-2026-10/`, dirección «C · Filas con su venta», con el ajuste de las dos medidas.

## El problema

La lista de Proveedores era un directorio: quién es, cuánto se le debe, cuándo entrega. Felipe lo dijo mirando la pantalla y cuatro rondas de
maquetas: «no puedo identificar a simple vista a quién le compro más o a quién le compro menos, tengo que leer letras pequeñas para enterarme
de cosas importantes». Con decenas de proveedores, un mosaico tampoco servía. Pidió un ranking que se pueda ordenar por prendas compradas y por
dinero, y a la derecha lo que no se ve a simple vista.

## Lo que se decidió

1. **La pestaña Mercadería es el ranking** (Felipe, al aprobar la lista de actividades): del que más le compras al que menos. Los activos sin
   compras van al final, en «Sin compras todavía», con su fila del directorio. El Taller va aparte, en su línea de «Producción propia». Servicios
   y quien no ve la plata de proveedores siguen con el directorio de siempre.
2. **Dos medidas, cada una con su ícono** (Felipe 2026-10-26): «Prendas compradas» (el polo) y «Dinero gastado» (el billete), como dos tarjetas
   de opción con el total de todos. El mismo ícono va junto a cada cifra del ranking. Cambiar de medida reordena: las filas se deslizan a su
   puesto nuevo (`useFlip`) y cada una dice cuántos puestos subió o bajó (↑ 2) hasta el próximo cambio. El dinero con la carga inicial como
   mayoría se escribe con «≈» (la regla `COSTO_REAL_MIN_PCT` del ADR-0502).
3. **El ritmo en cuatro palabras**, con la regla única de `proveedor-ritmo-reglas.ts`: Repón (lo que queda se acaba en 6 semanas o menos,
   verde), A su ritmo (pizarra), Frena (16 semanas o más, ámbar) y Poco para medir (menos de 20 prendas o menos de 3 semanas). La insignia dice
   las semanas y la palabra («3 sem · Repón»); en una tabla angosta, solo la palabra. Se filtra por ritmo o por «Con deuda vencida».
4. **Cada fila:** el puesto, el proveedor (y lo que se le debe, con lo vencido en rojo), la línea de lo vendido por día en 4 semanas con
   «N esta semana ↑/↓», el anillo con cuánto ya se vendió, la barra de cuánto le compraste contra el primero (lo oscuro ya se vendió, lo claro
   sigue en tus tiendas) y la insignia del ritmo. **Tocar la fila abre la vista rápida que ya existía** (Felipe).
5. **A la derecha, «Lo que no se ve a simple vista»** (`ProveedoresLoQueNoSeVe`), por urgencia: Para hoy (lo vencido, las entregas atrasadas,
   lo que te deben), Antes de volver a comprar (cuánto dependes de tus 10 primeros, cuánto tiene el costo por confirmar, quién no recibe una
   compra hace 90 días y los avisos de frenar, plata parada o margen) y Oportunidades (a quién reponer). Reemplaza en esta pestaña a las cifras
   de arriba y a «Lo que quizá no ves» de la lista. Desde 1280 px va al costado y se queda pegada al bajar; más angosto, baja.
6. **Las ventas por día salen de la base** (`fn_proveedores_ventas_diarias`): lo vendido NETO por proveedor y día de Lima, con las mismas
   prendas y la misma cuenta que «Lo que le compré» (salidas venta o cambio menos entradas cambio, devolución o anulación), sin el Taller y con
   la llave de siempre (`fn_ve_plata_de_proveedores()`). Así la línea nunca contradice las vendidas del ranking (lo prueba
   `pnpm pruebas:proveedores-ventas-diarias`). La web rellena con cero los días sin ventas.
7. **Comparar hasta 3:** cada fila tiene su casilla. Al marcar uno, la columna derecha pasa a «Comparar» y los pone lado a lado: cuánto le
   compraste, cuánto vendiste, en cuánto se vende lo que queda, sus ventas de 4 semanas, su margen y lo que le debes. Quitar el último devuelve
   la columna de siempre. Más angosto que 1280 px, la isla oscura de abajo dice cuántos llevas y lleva a la comparación.

## Lo que decidí yo (y Felipe puede cambiar)

- **La insignia del ritmo es el `<Chip>` del sistema** (ADR-0358), no las formas (triángulo, cuadrado) de la maqueta: una función, una pieza.
- **Con 3 marcados, el cuarto saca al primero que se marcó** en vez de bloquearse: perdona antes que preguntar (ADR-0350, ley 7), y la
  comparación a la vista dice quién quedó (`alternarComparar`).
- **La línea mira 28 días** (`DIAS_DE_VENTAS`): alcanza para ver si sube o baja sin que una venta vieja la aplaste.
- **En la tabla, 8 columnas que suman justo los 42 rem** desde los que se ponen en fila: así ningún ancho la desborda (probado de 1008 a 1920).

## Movimiento

Todo con piezas que ya existían: la entrada en cascada (`anim-entra`), el deslizamiento de filas al reordenar (`useFlip`), el chip que aparece
(`anim-revelar`), el anillo, la barra y la línea que entran una vez, la casilla que se marca y la isla que sube. Nada nuevo, nada en bucle: no
cambia la lista de excepciones del ADR-0136.

## Lo que NO hace todavía

- **Tallas y sedes** (actividad 6): la talla que se acaba primero y la sede que rinde, en la vista rápida y en la comparación. Dependen de
  `fn_proveedor_tallas_sedes`, construida en otra rama (`claude/proveedores-module-analysis-c73c2c`) que aún no llega a `main`.
- No escribe nada: el ranking, las ventas por día y la comparación solo leen.

## Cómo se verifica

`lib/proveedores-ranking-reglas.test.ts` (orden, ritmo, filtros, medidas, totales, lo de hoy, concentración, ventas por día y comparar),
`pnpm pruebas:proveedores-ventas-diarias` (7 casos contra Postgres, en las tandas del CI), `lib/guias.test.ts` (pasos «medida», «ritmo»,
«lado», «para-hoy», «oportunidades» y «comparar», con su huella), y la pantalla en el navegador local a 1008, 1024, 1280, 1440, 1920 y 375 px,
en claro y en oscuro. Con datos de producción se verá al pegar la migración: en local solo 2 proveedores tienen compras.

## Actualización 2026-10-26 (b): Formidable — el dinero con nombre, el porqué a un toque y comparar sin perder lo urgente

`/formidable` (informe: `docs/formidable/compras-proveedores.md`) encontró que tres cifras de dinero se leían como la misma, que el porqué de la
insignia vivía solo al pasar el mouse y que comparar escondía lo vencido. Con el OK de Felipe («Sí, haz los 3 cambios de Formidable en
Proveedores»), y sin tocar ninguna cuenta:
1. **Las medidas se llaman por lo que cuentan:** «Prendas que te llegaron» y «Lo que te llegó, a su costo» (sin IGV), en vez de «Prendas compradas» y
   «Dinero gastado». Lo facturado (con IGV, haya llegado o no) y lo que se debe van aparte y, en la comparación, juntos. «Margen» pasa a «Ganas de
   cada venta» y respeta el mínimo de 10 vendidas del veredicto.
2. **La palabra del ritmo lento es «Frena compras»** (una orden, no un estado) y su porqué está en la vista rápida, «Cómo se vende»
   (`porqueDelRitmo`). La comparación dice las semanas exactas (`semanasExactas`), porque «100+ sem» empataba a 385 con 202.
3. **Comparar entra arriba de la columna derecha y «Para hoy» se queda debajo;** la casilla tiene 32 px de blanco; una línea sobre la tabla dice el
   orden y que se marca para comparar.

**Lo que NO se arregló aquí y es lo más grave que encontró (decisión de Felipe):** `fn_proveedor_prendas_base` (ADR-0502, en producción) y
`fn_proveedores_ventas_diarias` cruzan lo vendido y el stock solo por prenda, así que una prenda que trajeron dos proveedores les suma sus ventas
enteras a los dos. Lo arregla la actualización (c).

## Actualización 2026-10-26 (c): el reparto entre proveedores y las tallas y sedes en la lista

Felipe aprobó, en la sesión de Proveedores: «Sí: que la sesión de maquetas mezcle mi rama de tallas y sedes, y arregle en una sola migración el
reparto de ventas y stock según lo que trajo cada proveedor, en las tres funciones.» Se mezcló `claude/proveedores-module-analysis-c73c2c`
(tallas y sedes en la ficha, ADR-0502 act. (e)).

**Los números:** la migración de tallas y sedes nació como `20261026144000` en la otra rama; al abrir el PR se renumeró a `20261026193000` (su
reserva era de esa rama y los candados de ADR-0381 la rechazaban) y la del reparto, que nació `20261026181000`, pasó a `20261026194000` para seguir
DESPUÉS de ella: el reparto reemplaza la función de tallas. Ninguna estaba en producción.

**El reparto, en un solo lugar** (migración `20261026194000`, NO pegada en producción): `fn_proveedor_reparto()` dice qué parte de cada variante
es de cada proveedor, y las tres funciones (`fn_proveedor_prendas_base`, `fn_proveedores_ventas_diarias`, `fn_proveedor_tallas_sedes`) leen de
ella; ninguna vuelve a cruzar ventas ni stock por su cuenta.
- **Lo que trajo cada uno**, por variante: cada recepción con su hora (al proveedor de la factura o del lote) y la carga inicial del habitual «desde siempre».
- **Cada venta, devolución o cambio se reparte por lo que cada uno había traído de esa variante hasta ese momento** (regla B, elegida por
  Felipe el 2026-10-26 entre tres, con el ejemplo de una talla: A trajo 40 en la carga, se vendieron 36, B trajo 40 por Compras y se vendieron 4
  más). A (por lo que entregó cada uno, sin fechas) daba 20 y 20: B heredaba ventas de antes de llegar y le salía «Repón» sin merecerlo. C (lo
  primero que llega es lo primero que se vende) daba 40 y 0: B salía «Sin ventas» aunque su talla se vendiera. B da 38 y 2. La regla vive en un
  solo bloque de la función («LA REGLA DE REPARTO»): cambiarla no toca nada más.
- **Cada prenda vendida es de un solo proveedor:** las partes se acumulan en el tiempo y se redondean por el mayor resto sobre lo acumulado. Así la
  suma entre proveedores es siempre lo vendido real (por día, por sede y en total) y ninguno se queda con todos los redondeos.
- **El stock** de cada variante y sede se reparte por lo que a cada uno le queda (lo que trajo menos lo que se le vendió), con el mismo redondeo
  sede tras sede: la suma es el stock real y el total de cada uno sale exacto.
- **La plata** de lo vendido va con la misma parte que su venta.
- Lo prueba `pnpm pruebas:proveedor-reparto` (en las tandas del CI): en toda la base la suma cuadra por variante, día y sede; y una prenda con la
  carga de A (40), 36 vendidas, lo de B por Compras (40) y 4 vendidas más le da 38 a A y 2 a B, con 2 y 38 en tienda, en las tres funciones.
- En la base local: la prenda que figuraba con 4 vendidas en tres proveedores ahora las tiene en uno solo, y el stock de 170 que los tres decían
  tener (510 en total) se reparte 17 + 33 + 120.

**Las tallas y sedes en la lista (actividad 6):** la vista rápida suma «Tallas y sedes» (qué tallas pedirle más o menos, cada tienda con su
palabra y el traslado sugerido) y la comparación, «Talla que pide más» y «La tienda que más vende». Las mismas cuentas de la ficha
(`resumenTallasYSedes`, con su prueba); se piden desde el navegador al abrir o marcar un proveedor, una sola vez; sin la función en la base, esas
partes no se dibujan. Las palabras de cada tienda viven en un solo lugar (`PALABRA_SEDE`) para la ficha y la lista.

## Producción (2026-10-26)

Felipe pidió pegarlas («Pégalas tú»). Antes de aplicar, en producción no había ninguna prenda traída por más de un proveedor (el conteo doble
todavía no se veía allá: Compras recién empieza) y «Lo que le compré» daba 335 filas, 981 vendidas y 2.495 en stock. Se aplicaron las tres, en
orden, con su texto exacto, por el MCP de Supabase (`apply_migration`). Después, solo leyendo: las mismas 335 filas, 981 vendidas y 2.495 en stock
(las prendas de un solo proveedor no cambian, como se prometió); la suma entre proveedores cuadra en todas las variantes; `fn_proveedor_reparto`
no la ejecuta nadie, y las otras dos, solo `authenticated`; «Lo que le compré» entera tarda 182 ms. Falta refrescar el volcado del diccionario
(`docs/datos/generado/COMO-REFRESCAR.md`).


## Actualización 2026-10-26 (b): dos líneas sobre la lista

**El problema (Felipe, con su captura a 2000 px):** entre la cabecera y el primer proveedor había siete franjas: las pestañas, las dos tarjetas grandes de «Prendas» y «Costo», el buscador, dos filas de píldoras de rubro, «Sin datos de pago» y la fila de ritmo. El primer proveedor quedaba en el borde de abajo. Sus palabras: los filtros «ocupan mucho espacio» y las dos tarjetas habría que achicarlas, «pero sobre todo ubicarlos mejor».

**Lo que cambió (solo cómo se ve, no qué hace):**
1. **Primera línea:** las pestañas Mercadería / Servicios a la izquierda y, a la derecha, «Ordenar por» con un segmento de modo (`SegmentoDeslizante forma="modo"`, la pieza decidida para «lo mismo de otra forma»). Cada opción lleva su ícono, su nombre y su total: «Prendas 2,885» y «Costo ≈ S/ 85,602». Lo que quiere decir la cifra elegida va en letra chica al lado («lo que te llegó, sin IGV · aproximado: el 99 % vino por la carga inicial»). Antes eran dos tarjetas de opción de 19,5 rem cada una.
2. **Segunda línea:** el buscador y los tres filtros como `DesplegablePildora`, la pieza decidida para «filtro que se abre» (ADR-0358): **Rubro**, **Ritmo** y **Datos de pago**. Cada opción lleva su cuenta adentro. Si hay alguno puesto, aparece «Limpiar filtros» (`BotonLimpiar`). Antes eran tres filas de píldoras sueltas.
3. **Las anclas de la guía** (`proveedores.medida`, `.rubros`, `.ritmo`, `.sin-pago`) quedaron en las piezas nuevas; los textos de esos pasos ahora dicen «ábrelo», y la huella se aceptó después de mirar la pantalla.

**Lo que se pierde a cambio:** las cuentas por ritmo (Repón 9, Frena compras 5…) ya no se leen sin abrir «Ritmo». La columna «Lo que no se ve a simple vista» sigue avisando lo urgente de cada grupo.

**Cómo se verificó:** en el navegador local a 1440 px y 1920 px en oscuro y a 375 px en claro (sin desborde horizontal); elegir un ritmo filtra la lista y «Limpiar filtros» la devuelve. En local los proveedores no tienen rubro, así que la píldora «Rubro» no se vio con datos.
