# ADR-0502 — Proveedores: lo que le compré, lo que vendí y «Lo que quizá no ves»

- **Fecha:** 2026-10-24 · **Estado:** construido y probado en local; **su migración `20261024221000_proveedor_prendas_compradas_y_vendidas.sql` NO está pegada en producción** (solo lee; espera el OK de Felipe). La web se publica DESPUÉS de la base: sin la función, la ficha y la lista se pintan como antes.
- **Relacionados:** ADR-0111 (ficha de proveedor), ADR-0387 (el módulo Proveedores es la llave del dinero), ADR-0161 (módulos y roles), ADR-0358 (una función, una pieza), ADR-0389 (guías interactivas), ADR-0195 (políticas y deadlocks).

## El problema

Proveedores era un directorio con facturas: quién es, cuánto se le debe, cuándo entrega. No decía lo que importa para comprar bien: **cuánto le compré, cuánto gasté, cuánto de eso ya se vendió y con qué margen**. Y nada interpretaba esos números por el dueño.

## Lo que se decidió

1. **«Compré» = el mayor entre las entradas de inventario y (vendido + stock actual), prenda a prenda, al costo vigente de la prenda; lo que sobra sobre las entradas se marca «estimado»** (Felipe 2026-10-24). Cuando una entrada viene de una línea de factura vigente, esa línea manda y es exacta. No cuentan cambios, devoluciones, traslados ni lo que fabrica el Taller.
   Por qué no solo entradas: en producción las 9 facturas no tienen líneas con unidades, y parte de la mercadería llegó sin quedar como entrada (Textil Anqori: 87 entradas, 115 en stock y 19 vendidas).
2. **Una sola cuenta en la base.** `fn_proveedor_prendas_base` (sin permiso para nadie) calcula por (proveedor, prenda); tres lecturas con la llave `fn_ve_plata_de_proveedores()`: `fn_proveedor_prendas` (ficha), `fn_proveedores_rendimiento` (ranking) y `fn_proveedores_prendas` (filas para el análisis). Excluye la «Prenda sin registrar» (centinela, ADR-0179).
3. **Ficha:** sección «Lo que le compré» (cifras: unidades, plata, ya vendido, margen, sin vender; una tarjeta por marca con su tabla por prenda).
   **Lista:** «A quién le compro y qué me deja» (ranking por gasto con una palabra: Rinde / Plata parada / Margen bajo / Pocas ventas).
4. **«Lo que quizá no ves»:** avisos de reglas puras y probadas (`lib/proveedor-analisis-reglas.ts`), sin IA generativa: mismas cifras, mismos avisos. Cada uno trae su «¿Por qué?» con los números y la regla. Con menos de 10 unidades vendidas no se concluye nada. Una prenda que llegó hace menos de 21 días no se juzga.
5. **Los umbrales son reglas de negocio de Felipe**, todos con nombre al inicio de `proveedor-analisis-reglas.ts` (21 días, S/ 1,000 parados, 40 %, 7 puntos de margen, 10 unidades, 60 % vendido, 26 semanas, 40 % de dependencia). Se cambian en un solo lugar.

## Lo que NO hace

- No escribe nada ni cambia stock, precios o movimientos.
- No separa al Taller («CAYLA SAC» es un proveedor más hoy): lo resuelve el tipo de proveedor (Mercadería / Servicios), otra sesión.
- El costo es el vigente de la prenda, no el de cada compra: la evolución real llegará con facturas con líneas.
- No muestra la foto de la prenda ni el cumplimiento de entrega (hay solo 9 facturas).

## Cómo se verifica

`lib/proveedor-prendas-reglas.test.ts` y `lib/proveedor-analisis-reglas.test.ts`; pantallas en el navegador local (ficha y lista) a 1440 y ancho de tarjeta angosto; `lib/guias.test.ts` con sus pasos y huella. Pendiente: verla con datos de producción tras pegar la migración, y a 375 px.
