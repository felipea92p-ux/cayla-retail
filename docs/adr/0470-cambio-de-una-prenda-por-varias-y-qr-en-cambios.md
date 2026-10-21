# ADR-0470 — Cambiar una prenda por VARIAS y cobrar la diferencia por QR

**Estado:** construido y probado en local; **SQL EN PRODUCCIÓN desde 2026-10-21** (las 7 migraciones, pegadas con el OK de Felipe por partes y en el orden de abajo; la web nueva va en el PR de esta rama) · **Fecha:** 2026-10-21 · **Decidió:** Felipe (aprobó las 5 actividades, y que esta entrega siga sin emitir comprobante nuevo)

## Contexto

El 2026-10-21, en la tienda de Trujillo, una clienta devolvió un body (S/ 45.90) y se llevó dos Top Rib (S/ 35.90 c/u), pagando la diferencia con el QR de Izipay
(boleta B005-000670). El sistema no lo permitía de una vez por dos razones:

1. **Un cambio guarda UNA prenda nueva** (`cambios.variante_nueva_id`). La colaboradora lo partió en un cambio uno por uno (diferencia −S/ 10: body 45.90 contra un top 35.90)
   más una venta aparte del segundo top por QR.
2. **El cambio no aceptaba el QR** (`cambios.metodo_pago_diferencia` solo admitía efectivo, tarjeta, yape, plin y transferencia). Para que el cajón no se descuadrara,
   anotó la «devolución» de S/ 10 como **transferencia**. No salió ninguna transferencia.

Efecto: «Por depositar Izipay» con S/ 10 de más, Interbank con S/ 10 de menos (el libro de dinero mostraba un «Cobros con transferencia −10» que no existió) y dos boletas que
suman S/ 10 de más. La clienta pagó lo correcto (S/ 107.70 por tres prendas); lo mal repartido fueron las cuentas.

## Decisión

1. **QR como medio de la diferencia de un cambio** (20261021183000 candado, 20261021184000 funciones). El candado de `cambios.metodo_pago_diferencia` acepta `qr`; `fn_dinero_libro` suma
   el QR de los cambios a «Cobros con QR»; la web lo ofrece solo si `fn_acepta_qr_en_cambios()` (la misma regla que `fn_acepta_pago_qr` de Vender). La cuenta (la máquina de Izipay de la sede)
   y el Diario ya conocían el QR (ADR-0429): no se tocaron.
2. **Una tabla hija `cambio_salidas`** (20261021185000): una fila por cada prenda que se lleva (todas, la primera incluida), de solo agregar. La fila de `cambios` sigue siendo el cambio:
   la prenda devuelta, la diferencia TOTAL, su medio y, como `variante_nueva_id`, la primera prenda. La llave al cambio es **diferida**: las prendas se anotan ANTES que el cambio, y así el
   disparador de actividad (que se escribe al insertar el cambio) ya las ve todas.
3. **`registrar_cambio_varias`** (20261021190000): `(línea, sede, prendas jsonb, cantidad devuelta, medio, token, motivo, condición)`. La diferencia es el valor de todo lo que se lleva (cada prenda
   a su precio de `fn_precio_para_cambio`) menos lo que la clienta pagó por lo que devuelve (ADR-0380); una entrada de la devuelta y una salida por prenda en `movimientos` (la misma fuente de verdad),
   todo o nada. **Copia las reglas de `registrar_cambio` tal como están HOY en producción** (permiso de sede, token que sigue al contenido, plazo, línea bloqueada, candados en orden, caja si hay
   efectivo, prenda sin precio). No toca `registrar_cambio`.
4. **Operación de marca propia** (20261021192000): «Revisar si se guardó» tras un corte de red conoce `registrar_cambio_varias` (se suma a `fn_resolver_intento` y a `OPERACIONES_CON_MARCA`).
5. **Lo que se lee DESPUÉS** (20261021193000): seis funciones leían `cambios.variante_nueva_id` como «todo lo que se llevó» y con un cambio por varias veían solo la primera:
   Resumen (`fn_resumen_comparacion`: cada salida valía «lo pagado + la diferencia TOTAL», así que dos salidas contaban la diferencia dos veces: S/ 143.60 donde son S/ 71.80), el Diario
   (`fn_asientos`: el ajuste de costo 691/201 se hacía contra la primera prenda), Análisis, demanda y plan del piso (`fn_analisis_sede`, `fn_demanda_sede`, `fn_piso_plan_lectura`) y la actividad
   (`fn_actividad_cambio`). Cada una es un reemplazo anclado con `left join cambio_salidas` y `coalesce`: un cambio de una por una no cambia.
6. **Web**: el paso «Reemplazo» suma «Se lleva otra prenda más» (cada prenda extra se elige como la primera y trae su cantidad); el panel dice qué falta; la diferencia, el impacto, el ticket y la
   confirmación usan el total. Las listas de cambios hechos dicen todas las prendas. **Sin extras, todo es exactamente lo de antes** (`registrar_cambio`).
7. **/chaos `INV-22`**: un cambio por varias cuadra su diferencia, las unidades que salieron y las que volvieron. Su autoprueba detecta la corrupción.

## Alternativas descartadas

- **Emitir nota de crédito y boleta por el cambio, reutilizando `emitir_nota` y `registrar_venta`** (la más correcta fiscalmente): toca dos funciones de dinero muy usadas y una transmisión a SUNAT
  asíncrona dentro de un guardado atómico. Se deja como decisión aparte: **hoy un cambio no emite comprobante, y esta entrega tampoco** (Felipe lo aceptó el 2026-10-21).
- **Varias filas de `cambios` por cambio:** `cambios.cantidad` también cuenta las unidades de la línea de venta que se devolvieron; una segunda fila de la misma línea contaría la unidad dos veces y
  rompería el «ya se cambió».
- **Un `jsonb` con las prendas dentro de `cambios`:** no se une con el catálogo ni se audita.
- **Reescribir `registrar_cambio` para que acepte varias:** el camino de una por una está probado y en uso; es más barato compartir reglas que reescribir lo que funciona (y la prueba repite las
  reglas compartidas contra la función nueva).
- **Aceptar `qr` en el cambio sin tocar el candado y guardarlo como «transferencia»:** es el mismo número falso que se corrige.
- **Corregir las cuentas de B005-000670 con un «entre cuentas»:** la base lo rechaza (ese tipo solo vale entre dos bancos o hacia un cajón). Ver «Dato corregido en producción».

## Lo que se rompe

- Un cambio por varias deja `cambios.variante_nueva_id` en la PRIMERA prenda: quien lo lea creyendo que es todo se equivoca. Los lectores conocidos están cubiertos (decisión 5).
- **No cubierto, a propósito:** `fn_movimientos` muestra la diferencia total junto a cada movimiento del cambio (es lo que dice el cambio); `tallasQueNoCalzan` mide pares «vendida / entregada» y en
  un cambio por varias solo cuenta la primera.
- Hoy cualquier colaboradora registra un cambio que devuelve plata: el candado de líder se quitó el 2026-09-23 (`20260923110500_cambios_sin_candado_de_lider.sql`). Esta función sigue esa regla viva.
- La guía de foco de `/cambios` sigue `PENDIENTE` (deuda de antes de la regla); el paso «Reemplazo» ganó campos y no se convirtió en `aplicada`. `/chaos` completo y el recorredor de guías
  (`guias:recorrer`, necesita un navegador de Playwright) no se corrieron: lo cubierto es la base (atomicidad, doble clic con el mismo token, token con otro contenido, permisos, línea ya cambiada).

## Dato corregido en producción (2026-10-21, con el OK de Felipe)

Un movimiento de dinero `abono_tarjeta` de **S/ 10.00** de «Por depositar Izipay» a Interbank (`movimientos_dinero.id` 05cfea96-4f9b-4990-824e-3d7121abcba8, fecha 2026-10-21, sin comisión), con la
referencia «Ajuste: cambio de B005-670 …». Anula en el libro el «Cobros con transferencia −10» de Interbank y baja «Por depositar Izipay» a lo que Izipay depositará. Se escribió por SQL **sin
responsable** (la sesión no tenía uno) y es reversible con `anular_movimiento_dinero`. No corrige: las boletas (S/ 10 de más sin nota de crédito, decisión del contador), ni los reportes por
método de pago (siguen mostrando QR 117.70 y transferencia −10, porque salen de la venta y del cambio, que no se tocaron).

## Producción

Siete archivos, **pegados el 2026-10-21** con `apply_migration` (la versión que queda en `schema_migrations` es la hora del pegado; se verificó por `md5(prosrc)`). Cada uno es idempotente. Orden (la política va **sola y al final**, regla «Políticas y deadlocks», ADR-0195):

1. `20261021183000_cambios_acepta_qr_parte1_candado.sql` — un `alter table` de `cambios` solo.
2. `20261021184000_cambios_acepta_qr_parte2_funciones.sql` — reemplazo anclado de `fn_dinero_libro` + `fn_acepta_qr_en_cambios`.
3. `20261021185000_cambio_varias_prendas_parte1_tabla.sql` — tabla nueva, índice, disparador (sin políticas).
4. `20261021190000_cambio_varias_prendas_parte2_registrar.sql` — `registrar_cambio_varias`.
5. `20261021192000_cambio_varias_prendas_parte4_revisar_envio.sql` — `fn_resolver_intento`.
6. `20261021193000_cambio_varias_prendas_parte5_lecturas.sql` — seis funciones (cada ancla se cuenta antes; si el texto cambió, se detiene sin tocar nada).
7. `20261021191000_cambio_varias_prendas_parte3_politica.sql` — la política de lectura, SOLA.

**Anclas comprobadas en producción en solo lectura el 2026-10-21:** las 12 aparecen exactamente una vez en las funciones vivas (`fn_dinero_libro`, `fn_resolver_intento`, las seis de la parte 5) y ninguna estaba ya aplicada;
el candado `cambios_metodo_pago_diferencia_check` existe con ese nombre.

Verificar después: el `md5(prosrc)` de cada función tocada y que `select * from retail.fn_acepta_qr_en_cambios()` dé `true`. Orden con la web: no importa (la web pregunta antes de ofrecer el QR, y sin la función
de la base cae al camino de una prenda). Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando se refresque el volcado: hay una tabla nueva (`cambio_salidas`).

## Verificación hecha

- `pnpm pruebas:registrar-cambio` 29/29 (QR sellado en la máquina y en el libro) y `pnpm pruebas:registrar-cambio-varias` 26/26 (el caso B005-000670, la diferencia contra lo pagado, todo o nada, doble
  clic, token con otro contenido, «revisar si se guardó», Resumen, Diario, actividad y plan del piso). Las pruebas de Resumen y del Diario **fallan** con sus parches revertidos (Resumen dice 143.60).
- Regresión: `fn-resumen-comparacion` 25/25, `fn-resumen-variantes` 39/39, `estado-resultados` 74, `piso-plan` 54/54, `motor-demanda-lectura` 11/11, `analisis-lecturas` 26/26,
  `motores-familias-apagadas` 15/15, `plan-piso-foto` 17/17, `token-sigue-al-contenido` 33/33, `cambio-sin-precio`, `roles-cobertura` 32/32; `chaos --autoprueba INV-22` detecta.
- vitest 569 archivos / 161.167 pruebas; tipos, eslint y Knip (los dos modos) en verde.
- En el navegador (base local): el cambio de una blusa de S/ 79.90 por dos polos de S/ 49.90 guardó S/ 19.90 por QR en «Por depositar Izipay» con las dos prendas, una entrada y dos salidas; a 375 px sin
  desborde horizontal.

## Verificación en producción (2026-10-21)

- `md5(prosrc)` igual al de la base local en: `fn_acepta_qr_en_cambios` fea61f3c…, `fn_dinero_libro` 3bda3634…, `fn_cambio_salidas_solo_agregar` 947b52fa…, `registrar_cambio_varias` c1adaac6…, `fn_resolver_intento` fff182d5…,
  `fn_actividad_cambio` 42c1d744…, `fn_analisis_sede` 38ba197d…, `fn_asientos` e8799a68…, `fn_demanda_sede` 3e03af81….
- **`fn_resolver_intento`: orden de la lista corregido también en producción (2026-10-21).** Al pegarla, `registrar_cambio_varias` quedó entre `registrar_cambio` y `separar_pedido_para_apartar` (md5 fff182d5…).
  Las suites de Postgres del PR mostraron que las migraciones viejas (20261014194000, 20261015042000) anclan en que esas dos sigan juntas, así que `20261021192000` se corrigió para agregarla al final de la
  tanda (después de `anular_pedido_web_pagado`) y se aplicó en producción la misma corrección (`cambio_varias_prendas_parte4_revisar_envio_al_final_de_la_lista`). Su huella allá es ahora la que deja el CI (8ebde058732c).
- **Distintos a propósito de local:** `fn_piso_plan_lectura` (prod 9fd51152…) y `fn_resumen_comparacion` (prod d5300100…). Sin mi parche, local y producción ya diferían (migraciones de otras ramas que aún no están en producción);
  el parche está puesto en las dos (comprobado por su texto).
- `fn_acepta_qr_en_cambios()` = true; el candado de `cambios` acepta `qr`; la política `cambio_salidas_select` existe; `anon` no ejecuta `registrar_cambio_varias` y `authenticated` sí; `cambio_salidas` tiene 0 filas (nadie ha guardado un cambio por varias en producción).
- Humo de lectura con una sesión de admin: `fn_asientos` (5.663 filas en 30 días), `fn_analisis_sede`, `fn_demanda_sede` y `fn_piso_plan_lectura` se ejecutan sin error; `fn_resumen_comparacion` corre (0 filas para la primera sede que devolvió el orden alfabético).
- **`fn_piso_plan_lectura` no coincide con lo que calcula el CI, y no es por esta migración.** Producción ya tiene encima el parche de #806 (`20261005160100`, «el motor del piso cuenta las ventas cerradas sin prenda»,
  pegado el 2026-10-12 y aún sin fusionar), así que su texto es «#806 + el parche de este PR» y el del CI es «main + el parche de este PR». El check «SQL pegado» de este PR queda en rojo por esa sola migración
  (`20261021193000`) hasta que #806 se fusione (o se decida otra cosa); las otras seis migraciones y las otras cinco funciones coinciden.
