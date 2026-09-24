# ADR-0189 — Varios usuarios a la vez: cambios, devoluciones y conteo sobre la misma prenda

- **Fecha:** 2026-09-23
- **Estado:** construido y probado en local; migración `20260924120000_concurrencia_cambios_devoluciones_conteo.sql`
  **por pegar en producción**. No cambia la web (solo un comentario): se puede pegar antes o después de fusionar.
  Va después de ADR-0188 (etapa 1, PR #373): parcha `registrar_cambio` sobre su definición viva, con o sin la etapa 1.
- **Contexto:** etapa 2a de la auditoría de concurrencia pedida por Felipe el 2026-09-23 («que funcione con varios
  usuarios a la vez»).

## Problema

1. **Una prenda vendida podía cambiarse o devolverse dos veces.** `registrar_cambio` sumaba lo ya cambiado de la línea
   de venta sin bloquearla, y `crear_devolucion` lo mismo con lo ya devuelto. El disparador que frena ventas anuladas toma
   un candado *compartido* sobre la venta, así que no separa dos cambios entre sí. Prenda vendida 1, dos terminales a la
   vez: las dos ven «0 cambiadas», las dos pasan, y salen dos prendas del piso por una sola vendida. Además, cada función
   se miraba solo a sí misma: se podía devolver una prenda ya cambiada (o cambiar una ya devuelta), y la prenda volvía al
   stock dos veces. La pantalla ya lo cruzaba (`unidadesDisponibles`, ADR-0122), la base no.
2. **Recontar una prenda en un conteo físico dejaba la foto vieja.** `conteo_contar` guardaba al recontar solo lo
   contado, no la foto del sistema. Sistema 5, contado 5; se venden 2 (quedan 3); se recuenta 3 → el cierre ajustaba
   3 − 5 = −2 sobre los 3 que había y dejaba 1 en el sistema con 3 en el piso.

## Decisión

1. **Una sola regla para cambios y devoluciones, en la base: `fn_exigir_linea_venta_disponible`.** Bloquea la línea de
   venta y exige que lo pedido quepa en *vendido − cambiado − devuelto*. Cuenta la devolución pendiente (ya aparta sus
   prendas mientras el líder decide) y no la rechazada (las libera). Una venta anulada no deja nada, con el mismo mensaje
   que ya da el disparador. El mensaje dice las cuentas: «De esa línea se vendieron 2: ya se cambiaron 1 y se devolvieron
   1 (contando las devoluciones por aprobar) — quedan 0, no puedes cambiar 1».
2. **El candado es `for no key update` sobre la línea**, no `for update`. Guardar un cambio, una devolución o un
   movimiento que apunta a la línea toma el candado de llave foránea (`for key share`); `for update` chocaría con eso.
   `for no key update` solo choca consigo mismo: separa dos cambios o devoluciones de la misma línea sin trabar nada más
   (mismo criterio que el costo promedio en ADR-0188).
3. **`registrar_cambio` vuelve a mirar el token después del candado.** Un doble clic que esperó al primero recibe el
   cambio ya guardado, como siempre, y no un «quedan 0».
4. **`crear_devolucion` bloquea todas las líneas pedidas de una vez y en orden de id**, así dos devoluciones de la misma
   venta con las líneas en distinto orden no se traban mutuamente.
5. **Conteo: recontar renueva la foto, y la foto espera a las ventas en curso.** `conteo_contar` pone `for share` sobre el
   stock de la prenda antes de leerlo (si una venta de esa prenda está a medio guardar, la foto espera y la incluye) y al
   recontar actualiza también `cantidad_sistema`.
6. **El cierre del conteo sigue ajustando *contado − foto* sobre el stock actual** (no «dejar el stock en lo contado»).
   Lo vendido entre el conteo y el cierre ya salió por su propio movimiento; si el cierre llevara el stock a lo contado,
   devolvería al sistema esas prendas vendidas. Ejemplo: se cuentan 6 con foto 5; antes de cerrar se venden 2 (sistema 3,
   piso 4) → el cierre suma +1 y deja 4. `cerrar_conteo` además bloquea de una vez, en orden de prenda, el stock que va a
   ajustar.
7. **Parche con anclas**, como ADR-0188, pero cada parche con su **marca**: si la marca ya está, se da por hecho
   (re-pegable); si no, el ancla tiene que aparecer exactamente una vez o aborta. Los bloques se insertan *antes* del ancla
   sin tocarla: `cerrar_conteo` usa como ancla la misma línea que la migración del conteo vacío (ADR-0174), y así las dos
   se pegan en cualquier orden.

## Alternativas descartadas

- **Candado sobre la venta entera (`for update` en `ventas`):** también cierra el hueco, pero choca con el disparador y
  con la anulación, y traba cambios de líneas distintas de la misma boleta.
- **Índice único o `check` en tablas:** «cambiado + devuelto ≤ vendido» cruza tres tablas; ningún `check` lo expresa, y un
  disparador por tabla tendría el mismo problema de lectura sin candado.
- **Aislamiento `serializable`:** obliga a reintentar desde la web; es mucho para un hueco que cierra un candado.
- **Cierre del conteo que fija el stock en lo contado:** descarta las ventas entre la foto y el cierre (punto 6).

## Lo que queda fuera (decisión de negocio, no técnica)

- **Devolver la prenda que la clienta se llevó en un cambio.** Hoy la devolución va por línea de venta, y la línea
  apunta a la prenda original; al aprobarla, reingresaría la prenda *original* (otra talla o color). Por eso la base ya
  no deja devolver lo ya cambiado. Si CAYLA quiere aceptar ese caso, necesita su propio flujo (devolución de un cambio);
  se le consulta a Felipe.
- **Una venta entre el conteo físico y el momento de presionar «guardar».** Ninguna base puede verla: la colaboradora
  contó con la prenda en la mano. Lo cubre el recuento (ahora sí actualiza la foto).
- Datos viejos con cambiado + devuelto > vendido no se corrigen; solo ya no se puede sumar sobre ellos.

## Cómo se verificó

- La migración aplicada dos veces seguidas en local: la segunda no cambia nada («0 parches aplicados, 6 ya estaban»); lo
  mismo en transacción con ROLLBACK dentro de `pruebas:concurrencia-linea-venta` (cada marca queda una sola vez).
- De cero: en una transacción con ROLLBACK se deshicieron los 6 parches, se pegó la migración dos veces y las 4
  funciones quedaron idénticas, byte a byte, a las del local.
- Casos nuevos que **fallaban antes y pasan después**: `pruebas:registrar-cambio` 21/21 (antes 19/21: cambiar una prenda
  con devolución pendiente; 2 vendidas, 1 devuelta, 1 cambiada → la tercera se rechaza con las cuentas),
  `pruebas:crear-devolucion-motivo` 11/11 (antes 9/11: devolver una prenda ya cambiada; devolver dos veces la misma),
  `pruebas:conteo-vacio --en-seco` 7/7 (antes el recuento tras una venta dejaba 1 donde había 3).
- **Dos sesiones reales** (`pruebas:concurrencia-linea-venta`, todo con ROLLBACK, sobre una línea ya confirmada del
  local): la sesión A hace el cambio/devolución y espera sin confirmar; la B intenta lo mismo con `lock_timeout`. Antes:
  la devolución B pasaba sin esperar («SIN_ERROR») y el cambio B recién se trababa en el stock. Después: las tres
  combinaciones (cambio+cambio, devolución+devolución, cambio+devolución) esperan en la línea de venta. 4/4.
- Sin regresiones: `pruebas:registrar-venta` 25/25, `pruebas:separaciones` 46/46, `anular_venta_comprobante` 9/9,
  `insumos_devolucion` 10/10. `aprobar_devolucion_caja` queda 2/5 como antes (falla en «Solo un líder puede aprobar», por
  la cuenta de prueba del local; previo y ajeno). `conteo-vacio` sin `--en-seco` da 6/7 porque el local no tiene el
  bloque del conteo vacío en `cerrar_conteo` (previo; con `--en-seco` 7/7).
