## Compras ▸ fase 6 de las órdenes de compra: fondo por rendir y gastos del viaje (2026-10-13) — rama `claude/purchase-order-phase6-9b0c82`

- **Qué:** la plata que CAYLA le entrega a quien compra. Actividad 1: Compras ▸ Fondos por rendir (entregar, devolver y anular, con el
  tablero de quién tiene cuánto). Actividad 2: pagar a un proveedor desde «Mi fondo»; si no alcanza, paga de su bolsillo y queda «CAYLA te
  debe». Actividad 3: los gastos del viaje desde Órdenes de compra (flete, agencia, cargador, embalaje → 609; pasaje, hotel, comida, taxi →
  631), a una o varias órdenes, con «Traerla costó» en cada una y nunca al costo de la prenda. Actividad 4: «Tu fondo», la tarjeta con lo
  que le queda, en Órdenes de compra y en el Inicio.
- **Por qué:** ADR-0362, decisiones 16, 20, 26, 29, 30, 32–35, 46, 54–57 y 65–70 (las 67–70, de esa noche). Felipe aprobó la lista de 8
  actividades y autorizó subir y pegar en producción cada actividad al cerrarla, sin fusionar.
- **Cómo:** el fondo es una cuenta de dinero de tipo `fondo` con su dueña (1413) y su saldo sale del mismo libro que «Cuentas y dinero»;
  no entra por las reglas generales de cuentas: los pagos y los gastos lo derivan a `fn_fondo_para_pagar` (solo su dueña, con su cuenta,
  nunca una terminal) y el Diario lo saca de la 1413. Migraciones `20261013181000`, `182000`, `212000`, `221000`, `222000` y `231000`;
  pruebas `pruebas:fondos` (16) y `pruebas:gastos-viaje` (12) más las vecinas de dinero en verde; web 158 876 pruebas en verde. Las cinco
  primeras están en producción desde el 2026-10-13 ~17:50: anclas comprobadas antes y, después, las 23 funciones con la misma huella que
  el banco. PR #1055 en borrador.
