# ADR-0597 — El costo de un paso que hace el Taller (Habilitado, Costura, Planchado)

**Estado:** construida y probada en local (`pnpm pruebas:produccion-costo-del-paso` 23/23, las otras 34 suites de Producción en verde, la web con sus pruebas) · **migración `20261101033000` SIN pegar en producción** (esperando el OK de Felipe) · **Fecha:** 2026-11-01 · **Decidió:** Felipe («necesito agregar costo al proceso de habilitado», y eligió «un paso con costo propio, también en el Taller» entre tres caminos) · **Sigue a:** ADR-0551 (el costo sigue al paso) y ADR-0400 (actividad 6, el costo al pasar al stock)

## Contexto

En la orden OP-000004 (Blusa Claudia, 69 prendas) el cuadro «Costo» decía Ploteo 25.50 y Corte 69.00 y de Habilitado no decía nada. Habilitado se hace en el Taller y ya estaba terminado (69 de 69). Hasta hoy solo costaban los
pasos que salen **afuera** (`tarifa_prenda` y `fijo_orden` de un servicio, ADR-0551 decisión 4). Lo que costó preparar las 69 prendas para coser no entraba al costo de la prenda, y no había cómo corregirlo: la base no deja cambiar
quién hace un paso que ya empezó (`fase_empezada`), así que «mandarlo afuera» obligaba a deshacer lo anotado.

## Decisión

**DECIDÍ:** un paso del Taller lleva su costo en los **mismos dos campos** que un servicio (`tarifa_prenda` por prenda terminada y `fijo_orden` por toda la orden). El CHECK `produccion_fases_quien` acepta tarifa y fijo con `quien = 'taller'`
(sigue sin aceptar proveedor, fecha prometida ni mínimo). Una función nueva, `poner_costo_a_fase(fase, tarifa, fijo)`, lo pone, lo cambia o lo quita **en cualquier momento mientras la orden esté en proceso**, también con el paso ya hecho:
lo que cuesta no cambia lo que pasó con las prendas. El costo **sigue a lo terminado** (terminadas buenas × tarifa + fijo) y entra al estimado, al real del cuadro «Costo» y al costo de cada prenda al pasar al stock.

**DESCARTÉ:** (1) *mandar Habilitado afuera «pendiente de registrar»*: sirve para órdenes nuevas, pero en las abiertas obliga a deshacer 69 prendas y miente sobre quién lo hizo; (2) *una tabla `produccion_otros_costos`*: otra fuente de verdad del
costo de la misma fase y una lectura más en cada función; (3) *un monto tecleado en la orden*: dejaría de seguir a las prendas terminadas y no se cruza con nada.

**SE ROMPE SI:** (a) quien hace el paso **ya está en la planilla del Taller**: ese sueldo ya se carga a la prenda por el costo del Taller (ADR-0400, d.5) y poner además una tarifa aquí lo cuenta dos veces (la hoja lo avisa; decidir qué se
costea por aquí y qué por planilla es de Felipe); (b) alguien vuelve a pegar `20261019192000` o `20261015160000` (recrean `fn_fases_de_orden` / `fn_orden_produccion` enteras) y el costo del Taller deja de sumar: se vuelve a pegar esta después;
(c) un paso con costo se manda afuera: la hoja de «¿Quién la hace?» pide la tarifa del servicio y la reemplaza, no se suman.

## Qué cambia

**Base** (`20261101033000_produccion_costo_de_un_paso_del_taller.sql`, una parte, sin políticas ni `drop trigger`): el CHECK más ancho (todo lo que valía, vale); dos reemplazos anclados (`fn_fases_de_orden`: devenga; `fn_orden_produccion`: suma
al cuadro), con su camino de vuelta probado; `fn_costo_servicios_orden` suma el devengado de todo paso con costo; `poner_costo_a_fase` (security definer, bloquea la orden, firma con el responsable, rastro en Actividad, exige ver los costos del
Taller). Rechaza: un servicio (`fase_no_es_del_taller`), un paso que se marca con un toque como Ploteo (`fase_es_hito`), una tarifa fuera de rango (`fase_tarifa_invalida`, topes de la tarifa de un servicio), una orden cerrada
(`orden_cerrada`) y quien no ve los costos (`sin_costos`). **No** genera cuenta por pagar ni gasto: el Taller no le debe a un proveedor.

**Web:** «Poner costo» / «Cambiar costo» en el paso abierto de la ruta (`RutaViva`) → `CostoDelPasoModal` (tarifa por prenda y/o fijo por toda la orden, la línea «Con las 69 prendas sale S/ 32.60», «Quitar el costo» aparte y en rojo,
aviso de la planilla, guía de foco). El cuadro «Costo» dibuja el paso como «Habilitado en el Taller» con su detalle, y «Cambiar quién» ya no le borra el costo a un paso que sigue en el Taller. Reglas puras en
`lib/orden-costo-paso-reglas.ts`; predicados en `lib/orden-pagina-reglas.ts`.

## Lo que queda abierto

- **Pegarla en producción** (con OK de Felipe; la base de producción tiene OP-000004 con Habilitado terminado: después de pegar, «Poner costo» le suma lo que costó).
- **Pasos nuevos con costo desde el inicio:** hoy el costo se pone después de abrir la orden; «Nueva orden» y «Agregar un paso» no lo piden. Si Felipe quiere el costo ya en la hoja de apertura, es una actividad aparte.
- **Costo por defecto por modelo o por proceso** (que Habilitado de la Blusa Claudia nazca con su tarifa): hoy cada orden lo escribe.
