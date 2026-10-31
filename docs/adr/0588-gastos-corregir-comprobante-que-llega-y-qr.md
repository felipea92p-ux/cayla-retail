# ADR-0588 — Gastos: corregir sin anular, «Llegó el comprobante», «No tendrá comprobante», el QR y la foto del comprobante

- **Fecha:** 2026-10-31 · **Estado:** construido y probado en local; las tres migraciones **están en producción** desde el 2026-10-31, con el OK de
  Felipe («Sí, pégalas»), pegadas en orden y una por una con `apply_migration` del MCP de Supabase (proyecto `vovjyyiafkxteijimpuy`), que las registra
  con la hora de aplicación: `20261031151000` → `20261031163305`, `20261031154000` → `20261031163834`, `20261031155000` → `20261031163913`. Antes de
  pegar se comparó la huella (md5) de las tres funciones vivas que se reescriben (`fn_gastos_solo_anular`, `fn_gastos_sellar`,
  `fn_exigir_egreso_del_pago`) con las que se usaron de base: idénticas. Después se verificó objeto por objeto (tablas con RLS y sin filas, disparadores,
  marcas, atributos y permisos; 263 gastos, 12 comprobantes y 12 pagos sin cambios).
- **Continúa a:** [ADR-0493](0493-el-telar-de-finanzas.md) (la pantalla de Gastos y su lista por día), [ADR-0195](0195-finanzas-un-comprobante-de-proveedor-y-cinco-modulos.md) F2 (un gasto con
  comprobante cuelga de `compras`), [ADR-0572](0572-corregir-un-gasto-de-otra-cosa.md) (el modelo de corregir con rastro, en Mis compras).
- **Origen:** Felipe, 2026-10-31. Una comparación de Gastos con las apps de gastos de hoy (Mercury y Kick corrigen la categoría en su lugar; Spendesk deja
  decir «no puedo dar el comprobante»; Qonto, Expensify y Holded leen el papel) dio 9 puntos; Felipe pidió los tres primeros. Decidió: la lista de 6
  actividades; que el comprobante que llega deje el gasto **«como si se registró con él»**; que lo marcado sin comprobante **«sale de la cuenta»**; y que
  una factura a nombre de otro **avise sin frenar**.

## El problema

Un gasto solo se podía anular. Una categoría mal elegida obligaba a anular y registrar de nuevo (la lista se llenaba de tachados, y si salió del cajón
anular no devuelve la plata a la caja); con una factura al contado ni eso, porque un comprobante con pagos no se anula. Un gasto pagado sin comprobante
quedaba marcado para siempre aunque el papel llegara al día siguiente, y uno que nunca lo tendrá (el gasfitero sin RUC) seguía pidiéndolo en «Te toca»
hasta que la gente aprendía a ignorarlo. Y el comprobante se tipeaba a mano, sin saber hasta declarar si la factura salió a nombre de CAYLA.

## Lo que se decidió

1. **Corregir** (`corregir_gasto`, 20261031151000): solo la categoría y el «qué fue», que no mueven plata. El monto, el pago, la sede y la fecha siguen el
   camino de siempre. La categoría sí mueve cuentas que no son plata (la línea del Estado de resultados, el rubro del Presupuesto y, en Lima, lo que se le
   carga a CLAURE), por eso **un mes cerrado no cambia la categoría** (`fn_candado_gastos` ya la mira); el «qué fue» sí se corrige. No se corrige un
   anulado, uno del viaje (va en Compras), la comisión de un abono ni lo ya rendido de un fondo. Todo o nada, idempotente por `lote`, con rastro inmutable
   (`gasto_correcciones`) que la hoja muestra como «Corregido · Ver qué cambió» (la pieza `CorreccionesDeCompra`, la misma de Mis compras).
2. **«Llegó el comprobante»** (`agregar_comprobante_a_gasto`, 20261031154000): el gasto queda **igual** a uno registrado con ese comprobante al contado.
   Se crea el comprobante con la fecha del papel (su IGV entra a Impuestos en ese mes) y se le pasa el pago que el gasto ya tenía, con **su** fecha,
   medio, cuenta y egreso del cajón: no se escribe ningún movimiento de dinero ni de caja. Para eso, tres marcas de la transacción
   (`retail.gastos_comprobante_tardio` = el id de ESE gasto) en `fn_gastos_solo_anular`, `fn_gastos_sellar` y `fn_exigir_egreso_del_pago` (el mismo
   gasto pasándole su egreso a su comprobante; `registrar_gasto` escribe el pago antes que el gasto y no la necesita). No en un fondo por rendir (su papel
   va en la rendición), uno del viaje ni un mes cerrado (el del gasto o el del papel), con un mensaje que dice para qué. Consecuencia, igual que un gasto
   registrado con su factura al contado: **ya no se anula**.
3. **«No tendrá comprobante»** (`marcar_gasto_no_emite`, 20261031155000): el motivo (no emite, se perdió u otro con nota) en `gastos_no_emiten`, una fila
   por gasto, inmutable, con rastro. La lista lo lee en la misma vuelta (`fn_gastos_no_emiten`, con la visibilidad de `fn_gastos_lista`) y la única regla,
   `pideComprobante`, lo deja fuera: sale de la marca, del chip, de la bandeja, de «Te toca» y del IGV «que recuperarías». Sigue en el filtro «Sin
   comprobante» (lo es) y en su hoja, en gris. Si después llega el papel, «Llegó el comprobante» lo agrega igual. Se puede en un mes cerrado: no cambia cifras.
4. **El QR** (`lib/qr-comprobante-reglas.ts`, sin base nueva): «QR del comprobante · opcional» en «Registrar gasto» (con factura o boleta) y en «Llegó el
   comprobante». La pistola lo escribe y termina con Enter (no se lee a mitad de la ráfaga: el número del comprador aún no está completo), se pega, o «Con
   la cámara» abre el lector de siempre (`EscanerBusqueda`, el de la boleta en Cambios) **en lugar** de la hoja, que sigue montada y no pierde lo escrito.
   Llena el tipo, el RUC, la serie y el número, la fecha y, si no hay, el monto; en «Llegó el comprobante», el IGV del papel si su total es el del gasto.
   Avisa sin frenar si el monto no coincide o si la factura no está a nombre del RUC de CAYLA.
5. **La foto del comprobante** (sin base nueva): la hoja de un gasto con comprobante muestra lo adjunto a esa factura en Compras (`compra_adjuntos`, una
   sola fuente) y suma una foto o un PDF. **No cambia permisos**: la ve quien ya ve el dinero de Compras y suma quien ya adjunta facturas; quitarla va en
   la factura de Compras. Firmar el enlace de un archivo deja de tapar la pantalla con el loader (`espera-reglas`: es leer).

## DESCARTÉ

- **Corregir el monto o el pago desde aquí:** mueven la caja, las cuentas y el comprobante. Es otra decisión, de Felipe.
- **«Solo anotar el número» del comprobante que llega:** lo descartó Felipe (el IGV no contaría y el papel quedaría en dos lugares).
- **Llamar a `fn_comprobante_y_pago`:** usa una sola fecha para el papel y el pago, y crea un egreso nuevo del cajón cuando no se le da uno. Sus
  validaciones se repiten igual, con los mismos mensajes.
- **Una columna en `gastos`** (corregido, no emite): `alter table` de una tabla en uso (ADR-0195) y tocar `fn_gastos_lista`.
- **Leer el QR en cada letra:** la pistola escribe rápido y el número del comprador se cortaría.
- **Reusar las fotos de los gastos del viaje:** son de Órdenes de compra y su hoja; el papel de un gasto de Finanzas es el de su factura.
- **Ampliar el permiso de las fotos a quien solo tiene Gastos:** es un permiso nuevo (de Felipe). Hoy no se le muestra nada.

## Cómo se verificó

- Postgres (ROLLBACK siempre, en `PRUEBAS` del CI): `pruebas:gastos-corregir` (38 casos), `pruebas:gastos-comprobante-tardio` (31: la equivalencia con el
  registro directo por transferencia y en efectivo del cajón, los saldos de todas las cuentas y la caja sin moverse, las marcas, el mes cerrado) y
  `pruebas:gastos-no-emite` (24). Siguen en verde `gastos`, `gastos-igv-perdido`, `cuenta-sellada` (82), `activos-y-gastos-fijos`, `fondos` (16),
  `caja-ingresos-con-origen` (31) y `candado-dinero-caja-cambios-devoluciones` (24).
- Web: `gastos-corregir-reglas` (26), `gastos-comprobante-tardio-reglas` (27), `gastos-no-emite-reglas` y `qr-comprobante-reglas` (20, también el RUC de
  dígito verificador malo y lo que no es un QR de comprobante), `espera-reglas`; tipos, lint, `knip` y `knip:produccion`.
- En local, con gastos de ejemplo (borrados después por id): corregir, «Llegó el comprobante» (la factura y su IGV en la lista, el rastro), «No tendrá
  comprobante» («Te toca» de 6 a 5), el QR por pistola, uno que no es de comprobante y la cámara de ida y vuelta, y la foto subida y listada. A 1440 y a
  375 px, claro y oscuro; `tema:auditar` con los tres escenarios nuevos: 0 hallazgos solo en oscuro. La guía de foco de las tres hojas y la guía
  interactiva de Gastos (la huella aceptada después de poner al día sus textos).

## Lo que no se hizo

- **Refrescar el diccionario de datos** con el volcado de producción (`gasto_correcciones` y `gastos_no_emiten` todavía no están en
  `docs/datos/generado/`).
- **La foto para quien solo tiene Gastos** (permiso nuevo) y **la foto al registrar** (hoy se suma desde la hoja del gasto, después).
- **El RUC de CLAURE**: la base no lo guarda, así que el aviso compara contra el de CAYLA y dice que una compra de CLAURE en Lima está bien.
- **El IGV del QR al registrar**: «Registrar gasto» deja que la base use la tasa (como siempre); solo «Llegó el comprobante» manda el del papel.
- **`/chaos` y `/formidable`** de las tres hojas: el doble clic y el reintento están cubiertos en la base (lote, el mismo papel, el mismo motivo), pero
  el ataque completo no se corrió.

## Lo que se aprendió al pegar

Al revisar los atributos en producción antes de pegar la segunda migración: `fn_gastos_sellar` y `fn_exigir_egreso_del_pago` son `security definer`, y
la reescritura no lo decía. Un `create or replace` sin esa línea las habría dejado corriendo con los permisos de quien llama, en silencio (en local las
pruebas pasaban porque todo entra por funciones `security definer`). Se corrigió en el archivo antes de pegar, y `pruebas:gastos-comprobante-tardio`
tiene un caso que lo vigila. **Al reescribir una función entera, se copian también sus atributos** (`security definer`, `stable`, `set search_path`).

## Qué se rompería si estuviera mal

Un saldo de cuenta o una caja que cambia al recibir un comprobante (la plata ya había salido); un egreso del cajón que respalda dos cosas; un gasto que
cambia su monto o su pago con la marca de corregir; un mes cerrado que cambia su Estado de resultados; un «no emite» que esconde un gasto de la lista.
Cada uno tiene su caso en las pruebas de Postgres.
