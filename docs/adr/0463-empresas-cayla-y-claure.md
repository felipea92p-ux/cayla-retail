# ADR-0463 — Empresas: CAYLA y CLAURE, y a cuál pertenece cada producto

> **Actualización 2026-10-27 ([ADR-0542](0542-stock-de-lima-por-dueno.md)):** la empresa ya no es solo un dato de la prenda: en Lima el stock se parte por dueño y lo marca la persona que opera. Nuevo producto vuelve a preguntar la tienda (que es la ficha y el dueño del stock inicial).

**Estado:** aceptada · migración EN PRODUCCIÓN desde 2026-10-20 (pegada por Felipe; la web sigue en el PR #1222) · **Fecha:** 2026-10-20 · **Decidió:** Felipe

## Contexto

Llega una segunda empresa, CLAURE, que es un negocio distinto de CAYLA. Comparten sede solo en Lima, y toda boleta o factura de CLAURE
sale con el RUC de CAYLA (un solo emisor: SUNAT/Lucode no cambian). Felipe pidió un campo, antes de «¿A qué categoría pertenece?» en
Nuevo producto, para elegir de cuál es la prenda. Una segunda sesión («Multi-brand setup Lima store») proponía guardar la empresa en la
marca; Felipe eligió que sea un campo del producto.

## Decisión

- **La empresa es un dato del producto** (`productos.empresa_id`, obligatorio, CAYLA de fábrica por `fn_empresa_casa_id()`), no de la marca:
  la marca es opcional al crear (ADR-0283) y la dueña de la prenda no siempre es la marca (CAYLA podría revender algo de CLAURE).
- **La pregunta vive en su propia tarjeta, sobre el paso 1** («¿De qué tienda es esta prenda?», `TarjetaEmpresa`), no dentro de «¿A qué categoría pertenece?» (Felipe 2026-10-20: la tienda no es una categoría). Para la guía de foco sigue siendo un campo del paso 1: su «Falta: Tienda» sale en el pie de ese paso.
- **Se pregunta solo desde una sede donde operan dos empresas** (hoy Lima): `retail.empresa_sedes` lista qué empresa opera en qué sede.
  Trujillo y Arequipa no ven el campo y guardan con CAYLA. Ninguna opción viene marcada (Felipe 2026-10-20).
- **En la base se llama «empresa», no «tienda»:** «tienda» ya es la sede y «Tienda web» es la tienda online. En pantalla el alta dice
  «Tienda» (como lo pidió Felipe) hasta que él diga otra palabra; cambiarla es una etiqueta.
- **Función nueva, ninguna reescrita:** `crear_producto_con_empresa` llama a `crear_producto_con_stock_inicial` y fija la empresa en la misma
  transacción, y rechaza una empresa que no opera en la sede (`empresa_fuera_de_sede`). Se suma a la lista de la hora declarada de
  `fn_actor_persona_id` (altas sin conexión).
- **Sin tablas con políticas:** `empresas` y `empresa_sedes` se leen por `fn_empresas_de_sede()`; una sola pegada, sin riesgo de deadlock.
- Las categorías son compartidas por las dos empresas.
- **La etiqueta de precio sigue a la empresa (Felipe 2026-10-20):** con CLAURE el papel dice «CLAURE» arriba y **sin el colibrí** (el logo es solo
  de CAYLA: se decide por `empresas.clave = 'cayla'`, no por `logo_url`); el link al pie es **«tienda.cayla.pe»** (la tienda online, no «cayla.pe») en
  las etiquetas de las dos empresas y en la de liquidación. Las lee `fn_empresas()`; sin ella, todo sale como CAYLA. Las etiquetas ya impresas no cambian.

## Alternativas descartadas

- **Empresa en la marca** (`marcas.empresa_id`): dos datos que se pueden contradecir, y una prenda sin marca quedaría de CAYLA en silencio.
- **Las dos a la vez, validadas entre sí:** prohibiría el caso legítimo marca CLAURE con dueña CAYLA.
- **Reescribir `crear_producto_con_stock_inicial` con un parámetro más:** una sobrecarga ambigua en PostgREST y un reemplazo anclado más sobre
  una función ya parchada varias veces.
- **Reconocer Lima por su nombre en la web:** el dato vive en `empresa_sedes`; el nombre («Tienda LIM» en producción, «Tienda Lima» en un
  banco local) solo se usa una vez, para sembrarla.

## Lo que se rompe si…

- Una sede nueva no se suma a `empresa_sedes`: se trata como solo-CAYLA (no pregunta); es seguro, pero CLAURE no podría registrarse allí.
- Se pega la web antes que la migración: `fn_empresas_de_sede` falla, `getContextoAlta` devuelve `empresas: null` y el alta es la de siempre.
- Hay otros caminos que crean productos sin preguntar (ver «Lo que falta»): nacen CAYLA a sabiendas.

## Lo que falta (decisión de Felipe)

- «Es nueva» al recibir y al contar, y el censo: caen a CAYLA sin preguntar; en Lima una cartera CLAURE debería preguntar.
- Editar producto con la empresa corregible (toca `catalogo_actualizar_producto`, de reemplazo anclado, ADR-0384).
- ~~Que el **stock** de CLAURE viva solo en Lima (Existencias, Traslados, carga inicial)~~ **Hecho en ADR-0505 (2026-10-24):** un disparador en `movimientos` no deja moverla fuera de Lima, y Vender, Catálogo, Existencias, Recibir y Contar no la ofrecen en Trujillo ni Arequipa.
- La etiqueta de **liquidación** solo cambió el link: sus piezas (`liquidacion_piezas`) no son productos y no tienen empresa; si hay piezas de CLAURE
  hay que decidir de dónde sale su empresa.
- La ayuda del campo de **costo** de Nuevo producto, con CLAURE elegida, debería decir que es lo que CLAURE le cobra a CAYLA (la liquidación lee ese costo).
- El nombre se sembró «CLAURE» sin tilde; el logo y la otra sesión dicen «Claurè»: es un dato (`empresas.nombre`) y sale tal cual en el papel.
- Filtros por empresa, pedidos web partidos y liquidación: los hace la otra sesión, leyendo `productos.empresa_id`.
- **Pedidos web (2026-10-21):** el detalle de un pedido dice la empresa de cada prenda (insignia encima del nombre) solo en una sede con más de una empresa (`fn_empresas_de_sede`). La web lee `productos.empresa_id`; no hay migración. No parte el pedido ni cambia el cobro: sigue siendo un pedido, una boleta con el RUC de CAYLA.

## Verificación

Migración probada dos veces seguidas con `begin … rollback` en el Postgres local (simulando la lista de `fn_actor_persona_id` de producción);
`fn_empresas_de_sede` da CAYLA+CLAURE en Lima y solo CAYLA en Trujillo, Taller y una sede inventada; CLAURE desde Trujillo se rechaza.
Pruebas: `alta-producto-guia.test.ts` (4 nuevas), `cola-hora-declarada.test.ts`, `guias.test.ts`. Pantalla vista en el navegador con datos
inventados (escritorio y 375 px). En producción (2026-10-20): `QUEDÓ BIEN`; CAYLA+CLAURE en «Tienda LIM», solo CAYLA en AQP, TRU y Taller; los 398 productos quedaron como CAYLA; `anon` no puede ejecutar la función. La sección de la hora declarada se saltó (producción aún no tiene la lista de 20261013155000: ver el backlog). No verificado: un alta completa de punta a punta con cuenta real.
