# ADR-0132 — Pagar juntos con varios medios: `registrar_pago_compras_medios`

- **Fecha:** 2026-09-19
- **Estado:** Aceptado. **Producción:** dos migraciones que Felipe pega en el SQL Editor, en orden:
  `20260919190000_pago_por_lote_varios_medios.sql` (ya pegada) y
  `20260919200000_pago_por_lote_medios_endurece.sql` (alinea la función con el endurecimiento de ADR-0135: token antes
  del saldo a favor y fecha de pago validada; requiere `fn_validar_fecha_pago_compra`, que verificado el 2026-09-19 ya
  existe en producción). Es solo una función nueva: no toca tablas, no toca datos, no modifica ninguna función existente.
  Hasta que se aplique, el modal sigue pagando con UN medio (la ruta de siempre) y solo falla si alguien divide el pago
  en dos medios.
- **Decide:** Felipe («procede con la función de pagar juntos»). Arquitectura: este documento.

## Contexto

Un proveedor de Gamarra se paga muchas veces con una transferencia y un complemento en efectivo o Yape. El pago de UN
comprobante ya lo permitía (`registrar_pagos_compra`, ADR-0111), pero «Pagar juntos» —varios comprobantes de un
proveedor en un solo acto— solo aceptaba un medio (`registrar_pago_compras(p_metodo …)`). Quien quería pagar S/ 2,832
como 2,000 por transferencia + 832 en efectivo tenía que registrar los comprobantes uno por uno y perdía justo lo que
el lote resuelve: un solo pago, un solo `pago_grupo_id`, conciliable contra el banco.

## Decisión

1. **Función nueva con otro nombre**, `registrar_pago_compras_medios(p_proveedor_id, p_aplicaciones, p_medios, p_fecha,
   p_token, p_credito)`, en vez de agregar un parámetro a `registrar_pago_compras`. `create or replace` con otra lista de
   parámetros crea una SOBRECARGA y PostgREST deja de resolver la llamada (nos pasó con `registrar_compra`); con otro
   nombre la vieja queda intacta y no hay ambigüedad.
2. **Reparto en cascada.** Los medios se gastan EN ORDEN entre los comprobantes (ya ordenados por la pantalla, lo más
   vencido primero): el primer medio agota su monto sobre el primer comprobante y sigue en el segundo, etc. Se escribe una
   fila de `compra_pagos` por comprobante y por medio, todas con el mismo `pago_grupo_id`. Después, con 3 comprobantes y 3 medios (2,000 transferencia + 1,000 Yape + 1,248 efectivo) en celular de 375 px: cascada correcta (1,416 / 584+832 / 168+1,248 repartidos por comprobante), sin desborde horizontal. Esa pasada corrigió dos detalles de celular: el segmentado «Si pagas menos» se cortaba (ahora lleva etiquetas cortas bajo `sm`) y la ✕ de cada medio quedaba al pie de la tarjeta (ahora arriba a la derecha). Cada comprobante conserva su
   propio historial.
3. **Σ medios = Σ aplicaciones − saldo a favor**, al centavo. El saldo a favor sigue entrando por `p_credito`, nunca como
   medio; si cubre todo, `p_medios` va vacío. Entre 1 y 8 medios; medio válido, monto > 0 con 2 decimales.
4. **Mismas garantías que la función de siempre:** un solo proveedor, tope por saldo, todo o nada, candado por
   comprobante (`for update` en orden de id), idempotencia por `p_token`, dinero solo del líder (ADR-0126).
5. **La pantalla elige la ruta:** con un medio (o todo con saldo a favor) llama a `registrar_pago_compras`, sin cambios;
   con dos o más, a la nueva. Por eso desplegar la pantalla antes que la migración no rompe el pago simple.

## Endurecimiento (ADR-0135)

La función se escribió sobre la definición de producción cuando el endurecimiento de los pagos aún no estaba en `main`, y
heredó dos huecos que esa migración cierra en las otras rutas: (M1) el saldo a favor disponible se miraba antes del token,
así que el reintento de un pago que usó saldo a favor fallaba en vez de devolver el éxito original; (M2) la fecha del pago
no se validaba. La segunda migración los corrige con la misma firma (`create or replace`, sin sobrecarga).

## Pantalla

`PagoJuntosModal` usa `MediosDePago` en modo `exacto`: con un medio es el diseño del spike (píldoras + referencia +
fecha) y su monto no se escribe —es lo que sale de verdad—; «＋ Dividir en otro medio» deja el primero con todo y agrega
una línea vacía; con dos medios, cambiar uno ajusta el otro para que sigan sumando; con tres o más aparece «Completar
con el último medio». Los datos de cada medio (cuenta, CCI, celular) se ven bajo cada línea. El botón no se habilita
mientras los medios no sumen lo que hay que cubrir.

## Verificación

`pnpm pruebas:pago-por-lote-medios` — 27 casos contra el Postgres local, cada uno en su transacción con ROLLBACK
(cascada, parcial, paridad con la función vieja, saldo a favor, cada rechazo, 8 medios, todo o nada, idempotencia,
permiso). Y un pago real de dos comprobantes con dos medios desde el navegador: 1,416 + 584 transferencia y 832 efectivo,
mismo `pago_grupo_id`.

## Qué queda

Tras aplicar en producción: `pnpm datos:generar:produccion` y `pnpm datos:comparar` (la función entra al diccionario).
