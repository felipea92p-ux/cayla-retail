# ADR-0166 — Apartados (en la base, `separaciones`): apartar prendas con adelanto, entregarlas con el saldo y devolver si no recogen

**Fecha:** 2026-09-23
**Estado:** Aceptado. **Base de datos implementada y probada en local** (`supabase/migrations/20260923090000_separaciones.sql`). **Aplicada en
producción el 2026-09-22** con el OK de Felipe, justo **después** de ADR-0141 (`20260920160000_apartar_stock.sql`), de la que depende:
las 10 funciones con md5 idéntico al repo y `fn_verificar_separaciones` en 0 filas. Pantallas: construidas y probadas en local (ver «Pantallas»).
**Decide:** Felipe, en lo de negocio (D1–D4 del 2026-09-22, `docs/maquetas/separaciones-2026-09/ANALISIS.md` §7; D5 propuesta y pendiente).
Arquitectura: este documento.
**Es la Fase 2 de ADR-0141**, y **revierte** una línea de su «Fase 2 — no construida»: allí se decidió «no se emite comprobante al recibir el
adelanto»; SUNAT exige emitirlo al cobrar (bienes muebles: al entregar o al cobrar, lo que ocurra primero; el IGV nace con el anticipo), y Felipe
eligió la boleta de anticipo (D1).

## Nombre (Felipe, 2026-09-23)

En pantalla el módulo se llama **Apartados**: menú, botones, mensajes de la base, boleta («Anticipo por apartado») y código **APT-TRU-0001**.
En la base se conserva `separaciones` (tablas y funciones): `apartados` ya es la reserva **por prenda** de ADR-0141, y un apartado de una
clienta agrupa varias de esas filas; renombrar chocaría. Regla para leer el código: *apartado de una clienta* = fila de `separaciones`;
*apartado de una prenda* = fila de `apartados`.

## El problema primero

Una clienta quiere una casaca, deja S/90 y vuelve el sábado. El ERP ya sabía **bloquear** la prenda (ADR-0141), pero no sabía nada del **dinero**:
el adelanto no quedaba en ninguna parte, no salía la boleta de anticipo, el efectivo del adelanto descuadraba el arqueo, se mezclaba con la venta
del día y, si la clienta no volvía, nadie se acordaba de devolvérselo.

**Analogía CAYLA:** la bolsa con el nombre de la clienta detrás del mostrador y el sobre con su adelanto. El sobre está en el cajón, pero no es de
CAYLA hasta que la clienta recoge; si no vuelve, la prenda regresa a la tienda y el sobre se le devuelve entero.

**Cómo se ve mal hecho:** registrar el adelanto como una venta (infla las ventas del día y paga IGV dos veces al entregar); registrarlo solo en una
nota de texto (el arqueo sale con sobrante y nadie sabe de quién es); liberar la prenda y cobrar en Vender en dos pasos (en la ventana entre uno y
otro, otra caja se la puede llevar); soltar la prenda sola al vencer sin anotar la devolución (la clienta pierde su dinero en silencio).

## Decisiones

**DECIDÍ 1 — `separaciones` es el documento; cada prenda es un `apartado` de ADR-0141.** `separaciones` guarda la clienta, total, adelanto,
vencimiento, cómo devolverle y el estado; `separacion_items` guarda el precio **congelado** y apunta a su `apartado`. El candado de stock no se
reescribe: `separar_prendas` llama a `apartar_stock`, y al cerrar se escribe el mismo movimiento `liberacion_apartado`.
**DESCARTÉ** llenar las columnas `adelanto_*` que ADR-0141 dejó en `apartados`: una separación de dos prendas tiene **un** adelanto y **una**
boleta, no dos. Quedan sin uso (no se borran: el repo no borra columnas con historial posible).
**SE ROMPE SI** alguien cierra un apartado de separación con `liberar_apartado` a mano: la separación quedaría abierta sin prenda.
`fn_verificar_separaciones` lo detecta («abierta con un apartado cerrado»).

**DECIDÍ 2 — el adelanto en efectivo es un ingreso de caja; los otros medios, no.** `separacion_pagos` registra todos los medios; el efectivo,
además, deja una fila en `caja_movimientos` (ingreso, con `separacion_id`), y un `CHECK` obliga a que exista si y solo si es efectivo. Como
`cerrar_caja` ya suma los ingresos manuales, **el arqueo cuadra sin tocar `cerrar_caja`** (probado al céntimo con adelanto, saldo y devolución en
efectivo en la misma caja).
**DESCARTÉ** una columna «fondo en custodia» en `cajas`: la custodia es la suma de los adelantos de las separaciones abiertas
(`resumen_separaciones`), un dato derivado, nunca un saldo editable (principio 4).

**DECIDÍ 3 — al entregar, la venta nace por el TOTAL y el adelanto es un pago `anticipo`.** `venta_pagos.metodo` acepta `anticipo`. Las ventas del
día reconocen el ingreso el día que la clienta recoge (así lo pide la contabilidad: el adelanto es un pasivo, cuenta 122 del PCGE, hasta la
entrega). `cerrar_caja` filtra `metodo = 'efectivo'`: el anticipo no se cuenta dos veces en el cajón.
**DESCARTÉ** llamar a `registrar_venta`: exige el precio y la campaña de **hoy** (`venta_precio_cambiado`, `venta_campana_omitida`) y ve la
prenda como no disponible (está apartada). `entregar_separacion` escribe la venta con el precio de la separación y **en la misma transacción** cierra
los apartados y saca las prendas: se cierra la ventana de segundos que ADR-0141 dejó anotada.
**SE ROMPE SI** una pantalla muestra `venta_pagos.metodo` sin conocer `anticipo` (hoy `fn_ventas_del_dia` lo lista tal cual: «anticipo + efectivo»).
Al construir la pantalla hay que sumarlo a `METODOS_PAGO` / `NOMBRE_METODO`.

**DECIDÍ 4 — comprobantes (D1).** Al separar: boleta o factura de **anticipo** por el monto del adelanto, con IGV (`comprobantes.es_anticipo`,
`venta_id` nulo). Al entregar: el comprobante por el **saldo**, que deduce el anticipo (`anticipo_deducido`, `anticipo_comprobante_id`); si el
adelanto fue el 100%, no se emite un segundo comprobante. Si se devuelve: nota de crédito sobre el anticipo.
**Candado de transmisión:** `lib/lucode.ts` todavía no arma los campos de anticipo de SUNAT; mandado como boleta común, el final llegaría con
líneas que suman S/179 y un importe de S/89. `motivoParaNoTransmitir` (`lib/transmision-reglas.ts`) frena los dos tipos hasta probarlos en el
sandbox de Lucode; la lectura de esas columnas es tolerante a que la web salga antes que la migración (error `42703` → «no es anticipo»).
**Pendiente:** confirmar con Lucode el payload de anticipo y regularización, y con el contador el caso del adelanto del 100%.

**DECIDÍ 5 — la devolución no espera a la nota de crédito.** `registrar_devolucion_separacion` registra el dinero devuelto (efectivo → egreso de
caja; Yape/Plin/transferencia/tarjeta → N.º de operación obligatorio) y **intenta** la nota de crédito en un sub-bloque: una nota solo se emite
sobre un comprobante ya aceptado por SUNAT y con serie de notas en la tienda. Si no se puede, la devolución se registra igual y la respuesta trae
`aviso` (principio 9: el dinero de la clienta nunca espera a un trámite).

**DECIDÍ 6 — vencer sin `pg_cron` (D3).** `fn_vencer_separaciones(ubicacion)` libera las abiertas vencidas hace **más** de 2 días (`liberada_por`
nulo = el sistema) y devuelve cuántas. Se llama al abrir la pantalla de la tienda; es idempotente y usa `for update skip locked` para no pisar una
entrega en curso. Si nadie abre el sistema no pasa nada malo: la prenda sigue guardada.
**DESCARTÉ** `pg_cron`: el proyecto de producción es compartido con Dynamic y hoy no tiene tareas programadas; agregar la primera es una decisión
aparte de este módulo.

**DECIDÍ 7 — permisos (D5, propuesta).** Separar y entregar: cualquiera que opere la tienda (como vender). Extender, liberar y registrar la
devolución: `fn_puede_gestionar_caja()` (líder o terminal de ventas, ADR-0160). Cambiarlo es cambiar una línea por función.

**DECIDÍ 8 — reglas en la base, no en la pantalla.** Plazo 7 días (D3), una sola extensión (`CHECK extensiones between 0 and 1`), adelanto > 0 y
≤ total (D2), celular de 9 dígitos, DNI obligatorio si la boleta pasa S/700, factura con RUC, devolución con su destino (`CHECK`: Yape/Plin con
número de 9 dígitos, transferencia con CCI de 20), y un `CHECK` de coherencia por estado. El único descuento aceptado es la campaña vigente el día
de separar; los descuentos manuales no entran en esta versión.

## Verificación

- **SQL, Postgres real** (`scripts/pruebas/separaciones.mjs`, `pnpm pruebas:separaciones`, en el CI): **46 escenarios**: separar (stock,
  custodia, boleta de anticipo, correlativo, idempotencia, factura, CCI, y cada rechazo: sin caja, adelanto de más, monto cero, sin pagos, celular,
  RUC, DNI sobre S/700, precio cambiado, descuento manual, sin disponible, `anon`); que una venta normal ya no se lleve la unidad separada;
  entregar (venta por el total, pago `anticipo`, apartado cerrado, prenda fuera, comprobante que deduce; precio congelado aunque suba el catálogo;
  100% sin segundo comprobante; pagos que no cuadran; doble entrega; idempotencia); extender/liberar con sus permisos; vencer respetando los 2 días
  de gracia; devolver (N.º de operación obligatorio, nota de crédito diferida con aviso y emitida cuando el anticipo está aceptado, efectivo como
  egreso, permisos); **el arqueo de `cerrar_caja` al céntimo**; búsqueda por DNI/celular/código/boleta; RLS y privilegios.
- **Regresión** sobre la base reconstruida desde cero (210 migraciones + seed): `apartar_stock` 46/46, `registrar_venta` 25/25,
  `venta_contrato_ampliado` 13/13, `ventas_del_dia` 11/11, `anular_venta_comprobante` 9/9, `comprobante_venta_anulada` 8/8,
  `fn_aplicar_movimiento` 11/11, `aprobar_devolucion_caja` 5/5, `registrar_cambio` 18/18, `candado_lider_caja_y_ajuste` 20/20, terminales en verde,
  `clientas` 16/16, `notas_credito_modulo` 42/42, `vendedora_en_venta` 7/7. Web: `tsc` ×3, `eslint`, **7845** pruebas de vitest.
- **Mutación:** se rompió la migración de 4 maneras (entregar sin cerrar el apartado; el cajón cuenta lo recibido con vuelto; cualquiera extiende;
  sin gracia de 2 días) y cada una hizo fallar al menos una prueba.
- **Idempotencia de la migración:** se aplicó dos veces seguidas sin error.
- **Entorno:** esta sesión no pudo bajar la imagen de Supabase (registro bloqueado); se usó un Postgres 16 nativo con el mismo stub de Dynamic y
  un arranque mínimo de `auth`/`storage`/roles. En el CI corre sobre `npx supabase start`, como las demás pruebas.

## Pantallas (2026-09-23)

- **Ruta** `/vender/apartados` (`app/(app)/vender/apartados/page.tsx`), solo en tiendas. Lee con `lib/separaciones.ts`, que antes llama
  `fn_vencer_separaciones` (el vencimiento ocurre al abrir la pantalla). Sin la migración (`PGRST202`) muestra «Apartados todavía no está
  activado» en vez de caerse.
- **Tres pestañas** en la misma hoja que «Venta en tienda» (`components/apartados/`): **Apartar** (solo lo escaneado; `resolverCodigoV2`;
  ticket → formulario con la barra de 3 tramos, `VendedorasFila` + `useVendedorasDeTurno` de ADR-0163 para «Atendió», los 5 medios con
  `ICONO_METODO`, vuelto, devolución preferida), **Entregar** (búsqueda por nombre/DNI/celular/boleta, línea de tiempo, cobro del saldo con
  `BilleteRapido`) y **Todos** (En custodia, Por devolver, filtros, lista por urgencia; +7 días, Liberar y Devolver solo con `gestionarCaja`).
  Modales con `<Modal>` (ADR-0136); ticket térmico por `#comprobante-print`, como «Venta registrada».
- **Reglas puras** en `lib/separaciones-reglas.ts` (15 pruebas): estado visible por fecha, barra de 9 tramos, validación, adelanto, vuelto.
- **Menú:** «Apartados» junto al Punto de venta. Ventas pasaba el tope de 6 hijas (ADR-0144), así que **Cambios y Devoluciones pasan a un
  subgrupo «Posventa»** (D-84, como Abastecimiento) en vez de subir el tope. `menu-hoy.golden.json` se actualizó a propósito en el mismo commit:
  **falta la aprobación de Felipe** de ese reagrupamiento.
- **Verificado en el navegador** con la app real contra Postgres (PostgREST + un Auth local, sin Docker): apartar dos prendas con efectivo y
  vuelto → boleta B004 de anticipo y APT-TRU-0001; entregar con billetes → venta por el total, vuelto y boleta final; vencido → liberar →
  devolver por Yape con N.º de operación; `fn_verificar_separaciones` y `fn_verificar_apartados` en 0 filas. Sin errores de consola.

## Cómo se pega en producción (con OK de Felipe)

1. Primero ADR-0141 (`20260920160000_apartar_stock.sql`), con su verificación.
2. Pegar `20260923090000_separaciones.sql` **entera** en el SQL Editor de cayla-dynamic (lleva `retail.` y `set search_path`). Aditiva y re-ejecutable.
3. Verificar (solo lectura): `select * from retail.fn_verificar_separaciones();` → 0 filas; que existan las 9 funciones; que
   `venta_pagos_metodo_check` acepte `anticipo`.
4. Las pantallas van después. La web vieja sobre la base nueva no cambia nada (nadie llama a las funciones nuevas).

## Se rompe si

- Se transmite un anticipo o su comprobante final sin el soporte de anticipos en `lib/lucode.ts` (lo frena `motivoParaNoTransmitir`).
- Una tienda no tiene serie de notas de crédito: la devolución se registra y la nota queda pendiente con aviso.
- Se mueve físicamente la prenda de piso a almacén: la reserva queda atada a la fila donde se hizo (mismo límite que ADR-0141).
- Se cambia el correlativo o el plazo a mano en la tabla: no hay pantalla para eso a propósito.
