# F3b · La cuenta sellada en cada movimiento de plata (ADR-0195, PLAN-FINANZAS §7 bis)

**Rama:** `claude/finanzas-f3b-sello` (desde `claude/finanzas-f3-f10`, con F3, F4, F5, F6, F8, F9 y Presupuesto ya
integradas). **Fecha:** 2026-09-24. **Estado:** construida y probada en local. La migración **no está en producción**: la
pega Felipe, en diez partes, después de F3.

## El problema

Hasta F3, ningún cobro ni pago guardaba DE QUÉ CUENTA de CAYLA salió o a cuál entró. Cuentas y dinero deducía el saldo de
los bancos por el medio y la tienda, y lo que no podía deducir quedaba «sin cuenta». El hueco más serio: un pago en efectivo
a un proveedor no decía si salió del cajón o de la caja fuerte, y el cierre de caja no lo descontaba. Si salió del cajón,
la tienda cerraba con un faltante que no existía.

**Medido en producción hoy (solo lectura):** hay 0 pagos a proveedores (`compra_pagos`), 0 pagos de Producción y 1 venta.
Los 12 pagos por S/ 15,661 de la medición del plan ya no están en la base (se archivaron con los datos de prueba). El hueco
es de diseño, no de datos: F3b lo cierra antes de que vuelva a abrirse.

## La regla

Todo lo que mueve plata guarda el **medio** (cómo) y la **cuenta** (dónde). La cuenta se **sella al guardar**: si mañana
el Yape de LIM pasa a otro banco, lo cobrado hasta hoy no se mueve.

- **Cobros (el mostrador no elige nada).** Un disparador `BEFORE INSERT` pone la cuenta sola:
  - el efectivo va al cajón de esa tienda;
  - Yape, Plin, tarjeta y transferencia van a la cuenta de `medios_de_cobro` vigente.

  Si la tienda no configuró ese medio, queda en nulo («sin cuenta»). El sello **nunca tumba una venta**: si algo falla,
  el cobro queda sin cuenta y la venta sigue.
- **Donde una persona decide de dónde sale la plata,** la pantalla propone una cuenta («Sale de», «Entra a», «Salió de»,
  «¿A qué banco?») y la manda. La base la valida con una sola regla (`fn_cuenta_sirve` + `fn_cuenta_sellada`):
  - que sirva para el medio:
    - efectivo → cajón, caja fuerte o lo que tiene el líder;
    - Yape, Plin, transferencia o depósito → un banco;
    - tarjeta → la tarjeta de crédito o un banco al pagar; el POS o un banco al cobrar;
  - que no esté archivada;
  - que el efectivo de una sede lo mueva solo quien opera esa sede. Lo que tiene el líder, solo el líder.

  Si no llega ninguna cuenta (la web de hoy), se sella la propuesta: la misma deducción de F3. En efectivo no hay
  propuesta: queda «sin cuenta» y **no se crea ninguna salida de caja a escondidas**.
- **Del cajón, con su movimiento de caja.** Un pago que sale de un cajón crea su egreso en la caja abierta, en la misma
  operación. Usa la MISMA `registrar_movimiento_caja` de siempre (caja abierta, permiso y firma), con motivo «Pago a
  proveedor». Así resta del cierre. Un reembolso que entra a un cajón crea su ingreso. Lo que sale del cajón es de hoy.
- **Un egreso respalda UNA sola cosa** (`fn_egreso_ya_usado`, parche por ancla). Ahora cuenta también el pago a un
  proveedor.
  - Única excepción: el gasto o activo con factura pagado del cajón comparte el egreso con el pago de SU factura, porque es
    una sola salida de plata.
  - El pago del cajón no aparece en «Egresos de caja por clasificar».
  - No se puede clasificar como gasto, ni marcarse «no es gasto», ni tomarse como depósito.
- **Lo sellado no cambia:** cada tabla tiene su disparador que lo impide. Nada se borra.
- **Los saldos** (`fn_dinero_libro`) usan primero la cuenta sellada, luego la asignada después y, solo si faltan las dos,
  la deducción de F3. El aviso «movieron plata sin decir de qué cuenta» se achica solo.

## Base — `supabase/migrations/20260925150000_finanzas_cuenta_sellada.sql`

| Tabla | Columna nueva | Quién la llena |
|---|---|---|
| `venta_pagos` | `cuenta_dinero_id` | disparador (cobro) |
| `separacion_pagos` | `cuenta_dinero_id` | disparador (cobro) |
| `cambios` | `cuenta_dinero_id` | disparador (la diferencia, entre o salga) |
| `devoluciones` | `reembolso_cuenta_id` | al aprobar: la elegida en «Sale de», o la de la tienda |
| `separaciones` | `devolucion_cuenta_id` | al pasar a «devuelta»: la elegida, o la de la tienda |
| `caja_traslados` | `cuenta_dinero_id` | caja fuerte y líder solos; el banco, el elegido en «¿A qué banco?» |
| `compra_pagos` | `cuenta_dinero_id`, `caja_movimiento_id` | la elegida (un egreso por pago, índice único) |
| `comprobantes_produccion_pagos` | `cuenta_dinero_id`, `caja_movimiento_id` | la elegida (un egreso por pago, índice único) |
| `proveedor_creditos` | `cuenta_dinero_id`, `caja_movimiento_id` | solo el reembolso: la elegida en «Entra a» |
| `gastos`, `activos_fijos` | `cuenta_dinero_id` | sin factura: la elegida en «Salió de». Con factura, va en su pago |

- `gastos_pago_coherente` y `activos_fijos_pago_coherente` se relajan. Un gasto en efectivo puede salir de la caja fuerte
  o de lo del líder: sin egreso de caja, con la cuenta.
- `apartados.adelanto_*` no se toca. Ninguna función de producción lo escribe: el adelanto de un apartado vive en
  `separacion_pagos` (verificado con `pg_proc` en producción).
- **Tabla nueva `cuentas_asignadas`:** lo pasado se completa una vez. Solo agrega filas, tiene RLS sin políticas y nadie
  la lee directo.
- **Lecturas y RPC nuevas:**
  - `fn_cuentas_para_elegir(clase, ubicacion)`: las cuentas que esta cuenta puede elegir, con la propuesta de cada medio
    para esa tienda. No trae saldos.
  - `fn_pagos_sin_cuenta()`: solo el líder. Sale del mismo libro de saldos que el aviso.
  - `asignar_cuenta_pasada(clave, cuenta)`: solo el líder. Valida con la misma regla del sello y no crea egresos ni toca
    cierres ya hechos.
- **Firmas nuevas.** Cada una suma un parámetro opcional al FINAL y quita la firma vieja (sin sobrecargas). Parten de la
  definición viva con parches por ancla (`pg_temp.reescribir`) y conservan los permisos de la vieja.

  | Función | Parámetro nuevo |
  |---|---|
  | `cerrar_caja` | `p_traslado_cuenta_id` |
  | `aprobar_devolucion` | `p_reembolso_cuenta_id` |
  | `registrar_devolucion_separacion` | `p_cuenta_id` |
  | `registrar_reembolso_proveedor` | `p_cuenta_id` |
  | `registrar_nota_credito_compra` | `p_reembolso_cuenta_id` |
  | `registrar_gasto` | `p_cuenta_id` |
  | `registrar_activo` | `p_cuenta_id` |
  | `fn_comprobante_y_pago` (interna) | `p_cuenta_id` |
  | `fn_insertar_reembolso_proveedor` (interna) | `p_cuenta_id` |
- **Parche sin cambiar la firma:** cada medio del JSON trae su `cuenta_id` en:
  - `registrar_compra`, `registrar_pagos_compra` y `registrar_pago_compras_medios`;
  - `registrar_comprobante_produccion` y `registrar_pago_comprobante_produccion`.

  `registrar_pago_compras` (un solo medio) queda igual: la web ahora usa la de varios medios también con uno.
- **Anclas verificadas contra producción** (2026-09-24, solo lectura, `regexp_matches` sobre `pg_get_functiondef`): las
  41 anclas aparecen exactamente una vez. Las que tocan funciones de F3 (`fn_egreso_ya_usado`, `fn_movimientos_dinero_validar`)
  se verifican al pegar, después de F3.
- **Sin `drop trigger` ni políticas:** todo disparador es `create or replace trigger`. Las únicas eliminaciones son
  `drop function` de la firma vieja y `alter table … drop constraint`, que no tocan `auth` ni `storage`.

## Web

- **Piezas compartidas** (sin tocar el kit):
  - `lib/cuenta-sellada-reglas.ts`: qué cuenta sirve para qué medio (el mismo cuadro que la base), la propuesta, «la
    elegida mientras sirva», los grupos del spike y la ayuda.
  - `components/finanzas/CampoCuenta.tsx`: `useCuentasParaElegir`, `OpcionesCuenta`, `CampoSaleDe` (campos del ERP) y
    `CampoCuentaFin` (campos de Finanzas). Cada pantalla pone su propio `<select>`, así el combo se ve como el resto de su
    pantalla. La cuenta va sin efectos: `cuentaEfectiva` = la elegida mientras sirva para el medio; si no, la propuesta.
- **Compras:**
  - Registrar comprobante al contado (`LineasPago`), pagar un comprobante (detalle) y «Pagar juntos» (`MediosDePago` de
    `PagoPiezas`) llevan «Sale de» en cada medio.
  - Con saldo a favor el campo queda invisible y conserva su lugar (ADR-0185).
  - «Pagar juntos» usa siempre `registrar_pago_compras_medios`, que es la que lleva la cuenta.
- **Producción:** pagar un comprobante y registrarlo al contado (`MediosDePago` de Producción): «Sale de» bajo cada medio.
- **Gastos ▸ Registrar gasto / activo:** «Salió de» elige la CUENTA, como el spike, y el medio sale de ella. Con un banco
  se pide «Cómo» (transferencia, Yape, Plin, depósito) y el N.° de operación. Del cajón, solo el de la tienda del gasto.
  Si la base no devuelve cuentas, queda el combo de medios de antes.
- **Devoluciones** (celular obligatorio): al aprobar con reembolso, «Sale de». En efectivo muestra «El cajón de la tienda»
  sin poder cambiarlo, para que la fila no cambie de alto (ADR-0185).
- **Apartados ▸ Devolver el adelanto** (celular obligatorio): «Sale de» bajo el N.° de operación cuando no es efectivo.
- **Compras ▸ Saldo a favor ▸ Registrar reembolso** y **Nota de crédito con reembolso:** «Entra a».
- **Caja ▸ Cerrar caja** (`CerrarCajaModalV2`, cambio mínimo): con «Depósito bancario» aparece «¿A qué banco?», propuesto
  con el banco de las transferencias de la tienda. El resumen final dice a qué banco fue. `CajaAbiertaPanel` y
  `PuntoDeVenta` solo le pasan `ubicacionId`.
- **Cuentas y dinero:**
  - el aviso «sin cuenta» ofrece «Decir de qué cuenta fue →»;
  - abre `PagosSinCuentaModal`, una fila por pago con su combo y «Guardar», firmado con el responsable;
  - `TEXTO_SIN_CUENTA` suma «reembolso».
- **Vender no cambia.**

## Las 22 situaciones de §7 bis

| # | Situación | Estado | Por qué / cómo |
|---|---|---|---|
| 1 | Venta en efectivo, Yape, Plin, tarjeta o transferencia | **Hecha** | Disparador en `venta_pagos`. Vender no cambia |
| 2 | Venta pagada con el adelanto | **Hecha** | El anticipo no tiene cuenta, a propósito: la plata entró al abonar |
| 3 | Abono de separación o adelanto de apartado | **Hecha** | Disparador en `separacion_pagos`. `apartados.adelanto_*` no se escribe en producción |
| 4 | Cambio con diferencia | **Hecha** | Disparador en `cambios`, también cuando CAYLA devuelve la diferencia |
| 5 | Proforma que se cobra | **Hecha** | Pasa por `registrar_venta` → `venta_pagos`. `liquidar_prenda_danada`, igual |
| 6 | El proveedor devuelve plata | **Hecha** | «Entra a» en Saldo a favor y en Nota de crédito. Al cajón, con su ingreso de caja |
| 7 | Aporte o préstamo del dueño | Ya estaba | F3 (`movimientos_dinero`) |
| 8 | El banco abona lo cobrado con tarjeta | Ya estaba | F3 |
| 9 | Devolución de plata a una clienta | **Hecha** | «Sale de» al aprobar. En efectivo, el cajón, como siempre |
| 10 | Devolución del adelanto de una separación | **Hecha** | «Sale de» en Devolver el adelanto. El libro de saldos ya la cuenta |
| 11 | Pago a un proveedor de mercadería | **Hecha** | Compras al contado, Por pagar (uno y juntos). Del cajón crea el egreso y resta del cierre |
| 12 | Pago a un proveedor del Taller | **Hecha** | Producción (al contado y Por pagar). El libro de saldos ya los cuenta |
| 13 | Gasto (y activo) | **Hecha** | «Salió de» con la cuenta. Con tarjeta de crédito sube la deuda |
| 14 | Pagar la tarjeta de crédito | Ya estaba | F3 |
| 15 | Planilla | Pendiente | La paga Dynamic. Toca Dynamic: decisión de Felipe |
| 16 | IGV y renta a SUNAT | Pendiente | F8 dejó fuera «Registrar pago a SUNAT». Cuando exista, usa `CampoSaleDe` y sella igual |
| 17 | Retiro o devolución de préstamo al dueño | Ya estaba | F3 |
| 18 | Salida de caja chica | Ya estaba | Es un egreso del cajón. Gastos lo clasifica (F2) |
| 19 | Cierre de caja al banco | **Hecha** | «¿A qué banco?» en el cierre. Sin elegir, el de las transferencias de la tienda |
| 20 | Caja fuerte o por rendir → banco | Ya estaba | F3 (depósito) |
| 21 | Entre bancos | Ya estaba | F3 |
| 22 | Efectivo de una tienda a otra | Pendiente | Fuera por ahora (ADR-0186: necesita acuse de recibo) |

## Decisiones (tomadas aquí; la razón en corto)

1. **Lo pasado no se toca.** Los cobros viejos quedan sin sello y el libro los sigue deduciendo como en F3, con vigencia:
   «la primera configuración vale para lo anterior». Los pagos viejos sin cuenta se completan UNA vez desde Cuentas y
   dinero, en una tabla aparte, sin editar el pago, sin crear egresos y sin tocar cierres. Si salió de un cajón ya cerrado,
   ese cierre ya lo absorbió como faltante.
2. **En efectivo, sin elegir no hay propuesta sellada.** La web de hoy, o `registrar_pago_compras`, deja el pago en efectivo
   «sin cuenta» en vez de adivinar un cajón. Un egreso de caja que nadie pidió cambiaría el cierre de una tienda.
3. **La propuesta en pantalla para efectivo:**
   - con tienda, su cajón si la caja está abierta; si no, su caja fuerte;
   - sin tienda (el líder desde la oficina, el Taller), antes una caja fuerte que un cajón.
4. **Un egreso por pago.** Un pago repartido entre dos facturas crea dos egresos, uno por fila. Así cada egreso respalda una
   sola cosa y se anula con su pago.
5. **Lo que sale del cajón es de hoy.** Un pago con fecha pasada no puede salir del cajón: se elige de dónde salió de verdad.
6. **Devolución a una clienta por tarjeta:** se propone el POS (por abonar); también acepta un banco.
7. **«Salió de» elige la cuenta primero** (Gastos, como el spike). En Compras, Producción, Devoluciones y Apartados el medio
   ya existía: «Sale de» se agrega debajo, filtrado por el medio.

## Cómo se pega en producción

Diez ejecuciones separadas, en orden. Cada una lleva `lock_timeout = 3s` y es idempotente. Antes deben estar F2 y las tres
partes de F3 (`20260925110000`). Se pega con el prefijo `retail.` que el archivo ya trae.

| Parte | Qué hace | Candados medidos en local |
|---|---|---|
| 1 · lo nuevo | Reglas del sello, disparadores (funciones), `cuentas_asignadas`, lecturas y RPC | Solo su tabla nueva |
| 2 · `venta_pagos` (sola) | Columna + disparador | La tabla, un instante |
| 3 · `separacion_pagos` (sola) | Columna + disparador | La tabla |
| 4 · `cambios` (sola) | Columna + disparador | La tabla |
| 5 · `devoluciones` (sola) | Columna + disparador | La tabla |
| 6 · `separaciones` (sola) | Columna + disparador | La tabla |
| 7 · `caja_traslados` (sola) | Columna + disparador | La tabla |
| 8 · `compra_pagos` (sola) | Dos columnas, índice único, disparador | La tabla |
| 9 · Finanzas y proveedores | Pagos de Producción, `proveedor_creditos`, `gastos` y `activos_fijos` (columnas, checks, disparadores) | Esas cuatro tablas |
| 10 · funciones | Firmas nuevas, parches por ancla, `fn_dinero_libro` | Ninguna tabla |

- Ninguna parte toma `auth` ni `storage`.
- Las columnas con FK toman además, un instante, `cuentas_dinero` y, en las partes 8 y 9, `caja_movimientos` (modo compartido
  exclusivo de filas: frena una escritura de caja unos milisegundos). Si dice «lock timeout», se repite ESA parte.

**Se rompe si la web nueva se publica antes:** manda parámetros que no existirían (`pnpm datos:comparar` lo dice:
`cerrar_caja`, `aprobar_devolucion`, `registrar_devolucion_separacion`…). La web de hoy **no** se rompe si esto se pega
primero:
- cada firma nueva solo suma un parámetro opcional al final;
- lo que llega sin cuenta se sella con la propuesta.

**Después de pegar,** en Configuración ▸ Cuentas y cobros (lo mismo que pide F3): cargar los bancos, el POS y la Visa, y a
qué cuenta entra cada medio en cada tienda. Sin eso, los combos dicen «Sin cuentas para este medio» y todo se registra igual,
«sin cuenta».

## Pruebas

- **SQL — `pnpm pruebas:cuenta-sellada`** (`scripts/pruebas/cuenta_sellada.mjs`): **76 casos** en 15 escenarios con ROLLBACK.
  También está en el CI. Cubre:
  - cada situación sella la cuenta correcta: Vender, apartado, cambio, devolución, adelanto devuelto, reembolso de
    proveedor, Compras al contado y Por pagar, Producción, gasto, activo y cierre;
  - sin cuenta configurada no falla;
  - el pago en efectivo del cajón resta del esperado del cierre; el de la caja fuerte, no;
  - un egreso no respalda dos cosas, en las cinco direcciones;
  - los saldos usan lo sellado: cambiar HOY el Yape de banco no mueve lo cobrado;
  - lo pasado se dice una vez;
  - lo sellado no cambia;
  - permisos: una sola firma por función, anon fuera, internas cerradas;
  - la migración se puede volver a pegar sin cambiar nada.
- **Siguen igual:** Vender, Cambios, Devoluciones, Apartados, Compras, Por pagar, Producción, cierre, Gastos, Cuentas y
  dinero, Impuestos, F5, F6, F9 y Presupuesto. Son 39 archivos de `scripts/pruebas/`, corridos antes y después de aplicar
  la migración: los mismos casos en verde y los mismos en rojo.
  - Los rojos ya lo estaban antes de F3b, por la base local: una sobrecarga vieja de `registrar_movimiento_caja` de 6
    parámetros que producción no tiene, y la líder de prueba «Sandra», que no existe en el seed local.
  - Se ajustaron dos pruebas viejas que vuelven a pegar migraciones anteriores (`notas_credito_modulo.mjs`,
    `candado_lider_caja_y_ajuste.mjs`). Primero se quita la firma nueva, dentro del ROLLBACK, como ya se hacía con
    `cerrar_caja` desde ADR-0186.
- **Web:**
  - `lib/cuenta-sellada-reglas.test.ts`: 19 casos.
  - `lib/gastos-reglas.test.ts`: +2 (32).
  - Suite entera: 89.123 pruebas en verde.
  - `tsc` y `eslint`: limpios.
  - `next build --webpack`: salida 0.
- **Comparación visual** en `/private/tmp/claude-501/…/scratchpad/f3b/`:
  - `spike-gasto.png` ↔ `app-gasto.png` y `app-gasto-cajon.png`;
  - `spike-pagar.png` ↔ `app-pagar.png` y `app-pagar-efectivo.png`;
  - `spike-cierre.png` ↔ `app-cierre.png`;
  - `app-reembolso.png`, `app-sincuenta.png`, `app-produccion.png`;
  - a 375 px: `movil-devolucion.png`, `movil-apartado.png`, `movil-apartado-transferencia.png`, `movil-cierre.png`.

  Las cuentas del fixture salen de `fn_cuentas_para_elegir` en la base local como líder, dentro de una transacción que se
  deshizo. La ruta de prueba (`app/auth/prueba-f3b`) no se commitea.

## Lo que queda distinto del spike, a propósito

- **Gastos, «Salió de» con un banco:** se suma «Cómo» (transferencia, Yape o Plin) y el N.° de operación. El spike solo
  tenía la cuenta, pero el medio se sigue guardando (cómo + dónde).
- **Sin saldo en las opciones.** El spike dice «BCP · S/ 38,420». Los combos no muestran saldos: los usa gente con Compras
  o Caja que no ve Cuentas y dinero, y sumar el libro en cada modal sería lento.
- **Cada combo lleva la forma de SU pantalla:**
  - Compras y Caja: campo con línea;
  - Producción: fila compacta;
  - Gastos y Cuentas y dinero: caja hundida de Finanzas.

  Los grupos, su orden y la frase de ayuda son los del spike.
- **«Pagar juntos» y el cierre de caja** conservan su diseño aprobado (ADR-0131 y ADR-0186). Solo se suma el combo.
- **«Decir de qué cuenta fue»** es nuevo: el spike no tenía cómo completar lo pasado.

## Pendiente / necesita a Felipe o al contador

- **Felipe:** cargar bancos, POS y tarjeta y los medios de cobro (igual que F3). Hasta entonces todo queda «sin cuenta» y
  los combos lo dicen.
- **Situaciones 15, 16 y 22:** ver la tabla.
- **«Si la tienda tiene dos cuentas para transferencias, pregunta cuál» (situación 1):** `medios_de_cobro` guarda una
  cuenta por medio y tienda. Si Felipe lo necesita, es una tabla de medios con varias cuentas y una pregunta en Vender.
  Hoy no se hizo, porque Vender no debía cambiar.
- **Una sola lista de medios de pago** (J del ADR, dominio + `packages/shared`): no entró, no estaba en el alcance de
  F3b. Siguen los `check` de cada tabla.
- **F5 (`fn_asiento_cuenta_de_medio`)** podría leer la cuenta sellada (`cuentas_dinero.cuenta_contable`) en vez del medio.
  Hoy no hay diferencia: con tarjeta, «Salió de» solo ofrece la tarjeta de crédito, que es la 451 que F5 ya usa.
- **F9:** si los pagos de Producción entran al diario, su disparador de mes cerrado va sobre
  `comprobantes_produccion_pagos` (lo dice F9).

## Para el orquestador (choques probables al integrar)

- **`supabase/migrations/20260925150000_*`:**
  - reescribe `fn_dinero_libro` (misma firma y columnas);
  - parcha `fn_egreso_ya_usado`, `fn_gastos_validar`, `fn_activos_validar`, `fn_egresos_no_gasto_validar` y
    `fn_movimientos_dinero_validar`.

  **Si alguien vuelve a pegar F3 en local, hay que volver a pegar F3b después.** F6 ya lee las claves nuevas del libro
  (`pagoprod:`, origen `reembolso`).
- **`app/estilos/finanzas.css`:** bloque `/* ---- F3b ---- */` al final (`fin-sin-cuenta*`). Ya se resolvió una vez contra
  F5/F6/F9.
- **`kit.tsx`:** sin cambios. **`lib/menu.ts`:** sin cambios (F3b no es una pantalla nueva).
- **Componentes de otros módulos tocados:**
  - `LineasPago`, `PagoPiezas`, `PagoJuntosModal`, `CompraDetallePanel`, `CompraFormV2`;
  - `MediosDePago` y los dos modales de Producción;
  - `RegistrarGastoModal`, `CerrarCajaModalV2`, `CajaAbiertaPanel`, `PuntoDeVenta` (solo la prop);
  - `DevolucionesPendientes`, `apartados/ModalesApartado`, `SaldoFavorAcciones`, `RegistrarNotaCreditoModal`;
  - `finanzas/CuentasDinero` (el enlace del aviso).
- **`lib/gastos-reglas.ts`:** `cuentaId` opcional en el borrador y `p_cuenta_id` en el payload.
- **`lib/medios-pago-reglas.ts`:** `cuentaId` opcional y un tercer parámetro en `mediosParaRpc`.
- **`package.json` y `ci.yml`:** `pruebas:cuenta-sellada`, junto a `pruebas:cuentas-dinero`.
