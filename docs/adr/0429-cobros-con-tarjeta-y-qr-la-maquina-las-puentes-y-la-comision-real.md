# ADR-0429 · Cobros con tarjeta y QR: la máquina que cobra, las cuentas «por depositar» y la comisión real

- **Fecha:** 2026-10-16 · **Estado:** **construido en la rama `claude/upbeat-euclid-d973d1`** (seis actividades de `/construir`, una por
  commit); **las cinco migraciones están SIN PEGAR en producción** y se pegan en orden, con el OK de Felipe (la quinta toca filas de
  producción y se ensaya primero). Lista de actividades aprobada por Felipe el 2026-10-16, con tres valores por defecto suyos: el
  histórico de tarjeta de TRU y AQP va a Vendemás, se rehace desde el 30 de septiembre y solo el líder registra depósitos.
- **Nace de:** la decisión 3 del ADR-0417 (aprobada el 2026-10-15) y el diseño de cobros con tarjeta del 2026-10-05.
- **Complementa:** ADR-0195 F3 (cuentas de dinero, `medios_de_cobro` con vigencia) y F3b (la cuenta sellada en cada cobro), ADR-0198 y
  ADR-0120 (el diario derivado), ADR-0332 (desde cuándo cuenta Finanzas), ADR-0417 (Fase 1 de Finanzas).

## El problema (medido en producción el 2026-10-16, solo lectura)

Todo lo cobrado con tarjeta y con QR desde el 30 de septiembre estaba sellado en el BCP, como si llegara completo y al instante. En
realidad lo cobra una **máquina** (Izipay o Vendemás) que lo deposita en **Interbank** entre uno y tres días hábiles después y **sin su
comisión**. Consecuencias: el saldo del BCP nunca cuadra con el banco, la comisión no existe en ningún lado (ni como gasto ni como
estimación) y el diario asentaba el QR como si fuera Yape (104). No había ninguna cuenta Interbank ni ninguna «por abonar». Las cifras
exactas quedan fuera del repo (es público): están en la nota de la sesión y en el ADR-0417.

## Decisión

DECIDÍ:
1. **La máquina es una entidad chica aparte** (`pos_maquinas`: Izipay, Vendemás), cada una con su cuenta puente 1 a 1 (`cuentas_dinero`
   de tipo `por_abonar`, cuenta contable 105: «Por depositar Izipay», «Por depositar Vendemás»), dónde opera y con qué medio
   (`pos_maquinas_sedes`: Izipay tarjeta y QR en las tres tiendas; Vendemás tarjeta en TRU y AQP) y sus tarifas con vigencia
   (`pos_tarifas`, solo agrega filas). Nace también la cuenta bancaria **Interbank** (104), en 0: su saldo inicial lo pone el líder.
2. **El destino por defecto de cada tienda sigue siendo «A qué cuenta entra cada cobro»** (`medios_de_cobro`, que ya guardaba historia),
   ahora con una fila para el QR y aceptando una puente para tarjeta y QR. Desde el 2026-09-30: tarjeta → Vendemás donde opera (Izipay
   donde no), QR → Izipay. Candado: la puente de una máquina solo recibe lo que esa máquina cobra en esa tienda con ese medio
   (`fn_pos_cuenta_sirve_en_sede`, en el sello y en Configuración).
3. **El cobro no gana columnas.** La hoja de cobro de Vender pregunta «¿Con qué máquina?» solo donde la tienda tiene dos para ese medio
   (la tarjeta en TRU y AQP: Vendemás viene marcada, Izipay a un toque); Lima y el QR no preguntan. Lo marcado viaja como `cuenta_id`
   en `p_pagos` y `registrar_venta` lo guarda en el `cuenta_dinero_id` que ya existía; el sello de F3b lo valida y, si no sirve, el
   cobro queda «sin cuenta» (el sello nunca tumba una venta).
4. **La comisión real es la diferencia del cruce, nunca se teclea.** El «Depósito de la máquina» (antes «Abono de tarjeta») toma los
   DÍAS pendientes que la persona marca —los mismos renglones `cobros:<día>:<tienda>:<medio>` que ya usa Conciliación—, suma su bruto y
   registra un abono por el neto que llegó con `comisión = bruto − neto` (el gasto 639 lo crea `registrar_movimiento_dinero`, como
   siempre). Qué días cubrió cada depósito queda escrito (`pos_abonos_lotes`): un día se liquida una sola vez mientras su abono esté
   vigente; anularlo lo libera. Un depósito mayor que lo cobrado se rechaza: una comisión negativa es un error de marcado, no un dato.
5. **La tarifa solo estima y avisa.** Con ella, cada día pendiente dice su comisión esperada (nula sin tarifa: nunca se inventa un
   número) y si está **atrasado** (más días hábiles —sin domingos— que los que la máquina tarda; sin tarifa, 3). Cuentas y dinero avisa
   «<máquina> no depositó N días» con el camino al depósito. El QR de Izipay nace sin comisión y al día siguiente (Felipe, 2026-10-05).
6. **El diario** asienta el QR que entra en la 105 (espera en la máquina), como la tarjeta. El abono y su comisión ya se asentaban bien
   (104 | 105 y 639 | 105).
7. **Lo pasado se rehace una vez**, con una función que solo corre desde una migración (`fn_resellar_cobros_a_maquinas`): los cobros con
   tarjeta y QR sellados en un banco desde el 30 de septiembre pasan a la puente de la máquina por defecto de su tienda, con el antes y
   el después de cada uno en `cobros_resellados`. La única puerta al sello es esa función; desde una pantalla el sello sigue sin cambiar.

DESCARTÉ:
- **Una sola cuenta «por depositar»:** si falta plata no se sabe de qué máquina es ni cuál cobra más (ADR-0417).
- **Directo a Interbank:** la comisión queda siempre estimada y Conciliación nunca cuadra (ADR-0417).
- **Hacer que la cuenta puente SEA la máquina**, colgándole tarifas y tiendas a `cuentas_dinero`: engorda la tabla núcleo con cosas de un
  proveedor (Tevanian: lo que puede vivir afuera, vive afuera).
- **Una tabla de máquinas como ÚNICA fuente del destino**, con `medios_de_cobro` de respaldo: dos tablas responderían la misma pregunta
  con una regla de precedencia, y el medidor de confianza del ADR-0417 (que lee `medios_de_cobro`) no la vería.
- **Una columna `maquina_id` en `venta_pagos`:** redundante con el sello 1 a 1 (la máquina se deduce de la cuenta).
- **Cruzar los depósitos «el más viejo primero» (FIFO) sin rastro:** no se podría diagnosticar «cruzado entre máquinas» ni saber qué día
  cubrió cada depósito.
- **Teclear la comisión a mano** (lo que existía): nada la cruzaba con lo cobrado y la puente podía quedar con un saldo de nadie sabe qué
  día.

SE ROMPE SI:
1. **Izipay deposita la tarjeta y el QR juntos** y la persona marca solo los días de un medio: la comisión saldría negativa; la función
   lo rechaza y pide marcar los dos.
2. **Un cobro con tarjeta de TRU o AQP fue en realidad de Izipay** (hoy o en el histórico): queda en Vendemás; el cruce del depósito de
   Izipay lo muestra como un día que falta. Felipe decide entonces (en el histórico lo aceptó de antemano).
3. **Una devolución con tarjeta cae en un día ya liquidado:** el renglón del día cambia de monto, Conciliación lo vuelve a pedir y la
   diferencia queda a la vista en la puente hasta el próximo depósito.
4. **Un feriado largo:** el aviso de atraso llega un día antes de lo justo (los feriados no se descuentan; avisar antes es mejor que
   después).
5. **Alguien recrea `registrar_venta`, `fn_cuenta_sellada` o `fn_asiento_cuenta_de_medio` desde un texto del repo anterior a esto:** el
   `cuenta_id` vuelve a ignorarse, el QR vuelve a la 104 o el sello deja de validar la máquina, en silencio. Las migraciones de esta
   decisión son reemplazos anclados sobre la función VIVA, y `pruebas:pos-maquinas` lo vigila en el CI.

## Qué se construyó (una actividad, un commit)

| # | Qué queda demostrable | Dónde |
|---|---|---|
| 1 | Una venta con tarjeta en Trujillo queda en «Por depositar Vendemás»; el QR en Izipay; Lima en Izipay sin preguntar; el diario asienta el QR en 105; Configuración ve el QR y las máquinas | `20261016173000_pos_maquinas_interbank_y_por_depositar.sql`, `lib/cuentas-dinero-reglas.ts`, `components/finanzas/ConfiguracionCuentas.tsx` |
| 2 | La hoja de cobro pregunta la máquina donde hay dos y lo marcado llega a la base; probado a 375 px (capturas en `docs/maquetas/cobro-maquina-2026-10/`) | `20261016182000_registrar_venta_anota_la_maquina.sql`, `components/punto-de-venta/HojaDeCobro.tsx`, `lib/vender-reglas.ts` |
| 3 | El depósito de la máquina cruzado contra los días pendientes: la puente vuelve a 0, Interbank sube lo que llegó, la comisión real queda como gasto 639 y Conciliación cuadra | `20261016190000_pos_abonos_lotes_y_deposito.sql`, `components/finanzas/CuentasDinero.tsx` |
| 4 | La tarifa por máquina y medio (Configuración), la comisión esperada por día, el aviso «no depositó» | `20261016191000_pos_tarifas_estiman_y_avisan.sql`, `components/finanzas/TarifaMaquinaModal.tsx` |
| 5 | Los cobros con tarjeta y QR desde el 30-sep pasan del banco a su puente, con rastro; la segunda vez mueve 0 | `20261016193000_resellar_cobros_tarjeta_qr_a_sus_maquinas.sql` |
| 6 | Este ADR, la bitácora y el backlog del día, el mapa de arquitectura y el PR | `docs/` |

Pruebas: `pnpm pruebas:pos-maquinas` (nueve secciones, en el CI), `lib/cuentas-dinero-reglas.test.ts`, `lib/vender-reglas.test.ts`; `/chaos` sobre
el cobro, el depósito y la tarifa (`docs/chaos/README.md`, informes locales en `.chaos/`); guías interactivas de Vender, Configuración y
Cuentas y dinero al día; guía de foco en la hoja nueva.

## Cómo se pega en producción (orden, con el OK de Felipe)

1. `20261016173000` (cuentas, máquinas, QR en el sello y en el diario). Una ejecución.
2. `20261016182000` (`registrar_venta` guarda la máquina). Una ejecución. **Antes de publicar la web de Vender:** si la web sale primero, la
   hoja no pregunta nada (no encuentra `fn_pos_maquinas_de_sede`) y nada se cae.
3. `20261016190000` (el depósito cruzado). 4. `20261016191000` (tarifas). Una ejecución cada una.
5. `20261016193000` (rehacer el histórico): **primero el ensayo** (el archivo entero más `do $$ begin raise exception 'ENSAYO_OK'; end $$;` al
   final) y se compara lo que dice con la sonda de solo lectura; después, tal cual.
6. Felipe, en la pantalla: el saldo inicial de Interbank (Configuración ▸ Cuentas, «Editar»), la tarifa de Vendemás y la de la tarjeta de
   Izipay cuando lleguen sus liquidaciones (Configuración ▸ Cuentas y cobros), y los depósitos que Izipay y Vendemás ya hicieron a Interbank
   desde el 30 de septiembre (Cuentas y dinero ▸ Registrar movimiento ▸ Depósito de la máquina, con el extracto; pueden ir agrupados por
   semana). Hasta entonces, las puentes muestran todo lo cobrado como pendiente y el aviso de atraso se prende: es lo correcto, no un error.

## Lo que queda fuera (a propósito)

- La comisión estimada **por venta** en el margen (Finanzas ▸ Análisis): otra pieza; aquí la estimación vive en lo pendiente de depósito.
- Apartados, cambios y devoluciones con tarjeta o QR no preguntan la máquina ni se rehacen (en producción, 0 filas al 2026-10-16): se
  sellan con la de defecto. `corregir_pagos_venta` tampoco manda máquina.
- Una devolución o anulación de una venta pagada con tarjeta se asienta hoy en la 451 (la tarjeta de crédito de CAYLA) en vez de salir de la
  puente o del banco: tarea aparte, propuesta el 2026-10-16 (hoy 0 casos).
- Los feriados en el conteo de días hábiles.
