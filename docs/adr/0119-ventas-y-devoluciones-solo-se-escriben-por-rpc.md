# ADR-0119 — Ventas, clientas, conteos, lotes y traslados solo se escriben por RPC

**Fecha:** 2026-09-18 (escrita) · 2026-09-23 (cerrada, PL-61/PL-84/PL-85)
**Estado:** Aceptada. **En producción ya estaba vigente** (verificado en solo lectura el 2026-09-23;
no se sabe quién la aplicó ni cuándo). La migración
`supabase/migrations/20260923234700_ventas_clientas_conteos_lotes_solo_rpc.sql` lleva ese estado al
repo; en producción es un no-op.
**Afecta:** `retail.ventas`, `venta_items`, `venta_anulacion_items`, `clientas`, `conteos`, `lotes`,
`transferencias`, `transferencia_items`.
**Continúa:** ADR-0055 (mismo candado en `movimientos`) y ADR-0177 (devoluciones, cambios, prendas dañadas).

## Contexto

La auditoría del 2026-09-17 marcó como el hueco de integridad más serio que las tablas del corazón
de la venta aceptaban INSERT/UPDATE directo desde el navegador, saltándose `registrar_venta` y
`anular_venta`. Para escribir hacen falta dos puertas abiertas: el permiso de tabla y una política RLS
que lo deje pasar. `0005_grants.sql` (y en producción la `0217` de Dynamic, al unificar) le dio
INSERT/UPDATE/DELETE a `authenticated` sobre TODAS las tablas de `retail`, y 7 de estas 8 tienen
política de escritura (`ventas_insert`, `venta_items_insert`, `venta_anulacion_items_write`,
`conteos_write`, `lotes_insert`, `transferencias_insert`/`_update`, `transferencia_items_insert`) que
solo pide poder operar la sede, no precio, stock, caja ni rol. `clientas` no tiene: la frenaba solo RLS.

La primera versión de este ADR (rama `claude/hola-baee84`, 18-09) cerraba 5 tablas y nunca se fusionó.
Lo que pasó después, verificado el 2026-09-23:

- `devoluciones`, `devolucion_items`, `prendas_danadas` y `cambios` se cerraron con ADR-0177
  (`20260922235000`, pegada el 22-09).
- En **producción**, las 8 tablas de este ADR ya tenían solo SELECT para `authenticated` y nada para
  `anon` (`relacl = authenticated=r`). Ninguna migración del repo ni de Dynamic lo hace: fue una
  escritura sin archivo ni registro.
- En el **repo** (base local, CI, cualquier base nueva) seguían abiertas. Es deriva repo ≠ producción,
  la misma que el BACKLOG ya había anotado para `transferencias` el 18-09 (ahí `transferencias_update`
  dejaba marcar un traslado cerrado sin crear movimientos).

## Decisión

**DECIDÍ:** revocar INSERT, UPDATE, DELETE y TRUNCATE a `authenticated` y `anon` sobre las 8 tablas,
dejando SELECT. Las políticas de escritura quedan como documentación, no como protección.

**DESCARTÉ:**
- **Borrar las políticas de escritura que ya no se usan.** Cambiaría producción sin ganar seguridad (el
  permiso ya las anula) y rompería la simetría con ADR-0055 y ADR-0177.
- **Cerrado por defecto en todo `retail`** (quitar escritura a toda tabla y devolverla solo a las de
  catálogo que la web escribe directo, y cambiar `alter default privileges`). Es la causa raíz, pero
  toca todos los módulos: lo decide Felipe (ver «Pendiente»).

## Evidencia

- **Quién escribe en las 8 tablas:** 18 funciones, todas `security definer` con dueña `postgres`:
  `abrir_conteo`, `anular_conteo`, `anular_venta`, `archivar_conteo_prueba`, `archivar_venta_prueba`,
  `cerrar_conteo`, `entregar_separacion`, `liquidar_prenda_danada`, `recibir_compras`, `recibir_envio`,
  `recibir_lote`, `registrar_clienta`, `registrar_venta`, `regularizar_prenda`, `iniciar_traslado`,
  `confirmar_traslado`, `registrar_recepcion_traslado`, `cerrar_traslado_con_diferencia`. Un `revoke` a
  `authenticated` no las toca.
- **La web:** cero escrituras directas (`.from('<tabla>').insert/update/upsert/delete`) a estas tablas.
- **Producción ya opera así.**
- **Prueba:** `pnpm pruebas:candado-ventas` (6 casos, cada uno con ROLLBACK, también en el CI). El
  control aplica el «cómo se deshace» y ve la puerta abierta; con la migración, las 24 escrituras
  directas (8 tablas × insert/update/delete) chocan con «permission denied for table», `anon` también;
  la lectura sigue, y `registrar_clienta` y `abrir_conteo` siguen escribiendo. Mutación: quitar
  `clientas` de la migración hace caer la prueba.

## Cómo se deshace

```sql
grant insert, update, delete on retail.ventas, retail.venta_items, retail.venta_anulacion_items,
  retail.clientas, retail.conteos, retail.lotes, retail.transferencias, retail.transferencia_items
  to authenticated;
```

Sin pérdida de datos: la migración no toca filas.

## Pendiente que este ADR NO cierra

- **La causa raíz sigue:** `alter default privileges` (en `0005` y en la `0217` de Dynamic) le da
  escritura a `authenticated` en toda tabla nueva. Cada tabla nueva nace abierta y depende de que alguien
  recuerde revocar.
- **19 tablas en producción dependen de una sola capa** (permiso abierto, RLS sin política de
  escritura): `caja_movimientos`, `cajas`, `codigos_correlativos`, `compra_adjuntos`, `compra_items`,
  `compra_pagos`, `compras`, `comprobantes`, `configuracion_empresa`, `conteo_items`, `gastos`,
  `insumo_lotes`, `movimientos_insumo`, `produccion_lineas`, `producciones`, `proformas`,
  `series_comprobantes`, `ubicacion_datos_fiscales`, `venta_pagos`. Hoy no se pueden escribir directo,
  pero basta con que alguien les agregue una política.
- **Nadie sabe quién cerró las 8 tablas en producción.** Por eso PL-95 exige registrar cada SQL pegado.
