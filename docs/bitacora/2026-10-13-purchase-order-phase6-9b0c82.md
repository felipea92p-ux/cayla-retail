## Compras ▸ fase 6 de las órdenes de compra: fondo por rendir y gastos del viaje (2026-10-13) — rama `claude/purchase-order-phase6-9b0c82`

- **Qué:** la plata que CAYLA le entrega a quien compra. Actividad 1: Compras ▸ Fondos por rendir (entregar, devolver y anular, con el
  tablero de quién tiene cuánto). Actividad 2: pagar a un proveedor desde «Mi fondo»; si no alcanza, paga de su bolsillo y queda «CAYLA te
  debe». Actividad 3: los gastos del viaje desde Órdenes de compra (flete, agencia, cargador, embalaje → 609; pasaje, hotel, comida, taxi →
  631), a una o varias órdenes, con «Traerla costó» en cada una y nunca al costo de la prenda. Actividad 4: «Tu fondo», la tarjeta con lo
  que le queda, en Órdenes de compra y en el Inicio. Actividad 5: la rendición (rendir, revisar y aprobar; el faltante lo asume CAYLA o
  queda como deuda; las fotos de los papeles). Actividad 6: lo «no deducible» (efectivo o fondo en un comprobante de S/ 2 000 o más, y lo
  que pase el tope diario de la planilla, que fija el contador): se avisa al pagar y se marca donde se ve cada pago o gasto. Actividad 7:
  saldar la deuda de un faltante cuando la persona devuelve la plata (lo registra quien la recibe), y la 1413 y la 1419 comparadas por dos
  caminos en el Balance. Actividad 8: el IGV. La factura con RUC de un gasto del viaje va al crédito fiscal (la hoja dice cuánto se
  descuenta), y el IGV de lo pagado en efectivo o desde un fondo se pierde en el mes del pago: Impuestos lo resta y lo avisa, el resumen
  para el contador lo trae y el Diario lo pasa de la 4011 a la 64. De paso entró, con cherry-pick, el arreglo de otra sesión para las
  tablas de Fondos por rendir a 1024 px. Y, a pedido de Felipe, la hoja del gasto del viaje muestra solo la orden desde la que se abrió:
  las demás se suman con «+ Agregar otra orden» (el combo con buscador) y se quitan con su «×». Y todo gasto del viaje va al menos a
  una orden: la hoja no deja quitar la última y la base frena uno sin orden (`20261014170000`).
- **Por qué:** ADR-0362, decisiones 16, 20, 26, 29, 30, 32–35, 46, 54–57 y 65–75 (las 67–70, de esa noche; las 71–75, del 2026-10-14:
  la deuda solo se salda cuando la persona devuelve la plata, el IGV perdido va al mes del pago, la contabilidad se parte en dos, la
  hoja del gasto no carga la lista de órdenes y un gasto del viaje va siempre al menos a una orden). Felipe aprobó la lista de 8
  actividades y autorizó subir y pegar en producción cada actividad al cerrarla, sin fusionar.
- **Cómo:** el fondo es una cuenta de dinero de tipo `fondo` con su dueña (1413) y su saldo sale del mismo libro que «Cuentas y dinero»;
  no entra por las reglas generales de cuentas: los pagos y los gastos lo derivan a `fn_fondo_para_pagar` (solo su dueña, con su cuenta,
  nunca una terminal) y el Diario lo saca de la 1413. Migraciones `20261013181000`, `182000`, `212000`, `221000`, `222000`, `231000`,
  `233000`, `234000`, `235000`, `20261014002000`, `20261014145000` y `20261014153000`; pruebas `pruebas:fondos` (16),
  `pruebas:gastos-viaje` (12), `pruebas:rendicion-fondo` (11), `pruebas:no-deducible` (5), `pruebas:deuda-fondo` (4) y
  `pruebas:igv-fase6` (4), más las vecinas de dinero, Balance e impuestos en verde (`pruebas:estado-resultados` ahora cuenta el IGV
  perdido de su escenario: 152,54); web 159 250 pruebas en verde. Todas en producción, cada una con sus anclas comprobadas antes y sus
  huellas iguales a las del banco después (la de la actividad 6, 2026-10-13 ~20:10: 4 funciones, 3 restricciones y los permisos; la de
  la 7, 2026-10-14 ~09:58: 21 huellas; la de la 8, 2026-10-14 ~10:37: 8 funciones, la restricción de `gastos` y los permisos). Lo no
  deducible se calcula, no se guarda: una sola regla en la base (`fn_pago_no_bancarizado`, `fn_no_deducibles`); lo que se debe, también
  (`fn_deudas_fondo_de`), y el IGV perdido (`fn_igv_perdido`). PR #1055 en borrador.
