# ADR-0104 — Ventas y devoluciones solo se escriben por RPC

**Fecha:** 2026-09-18
**Estado:** Escrita y probada en local con ROLLBACK (16/16, `pnpm pruebas:candado-ventas`,
corrida el 2026-09-18). **Los archivos se perdieron esa tarde al recrearse el worktree y se
reescribieron; la prueba NO se volvió a ejecutar después de la restauración** (sin Docker en la
sesión). Correr `pnpm pruebas:candado-ventas` y ver 16/16 antes de pegar en producción.
**No aplicada en producción** — falta que Felipe corra
`docs/datos/VERIFICAR-ESCRITURA-DIRECTA-2026-09-18.sql` allá y dé el ok puntual antes de pegar
la migración.
**Afecta:** `retail.ventas`, `venta_items`, `devoluciones`, `devolucion_items`,
`venta_anulacion_items` en `supabase/migrations/20260918160000_ventas_devoluciones_solo_rpc.sql`.
**Continúa:** ADR-0055 (mismo candado, ya aplicado a `movimientos`).

## Contexto

La auditoría del 2026-09-17 (`docs/AUDITORIA-2026-09-17.md`) marcó como el hueco de integridad
más serio que `ventas`, `venta_items`, `devoluciones` y `devolucion_items` aceptan INSERT/UPDATE
directo desde el navegador. Al rastrearlo se confirmó, y se corrigieron dos cosas de la propia
auditoría:

1. **El hueco no es de 4 tablas, es de 10.** Para escribir hacen falta dos puertas abiertas: el
   permiso de tabla (`0005_grants.sql` se lo dio a `authenticated` sobre TODAS las tablas de
   `retail`) y una política de RLS que lo deje pasar. Cruzándolas en el Postgres local, 10 tablas
   tienen las dos abiertas para cualquier colaborador de la ubicación: las 4 auditadas más
   `venta_anulacion_items`, `transferencias`, `transferencia_items`, `conteos`, `lotes` y
   `clientes`. Otras 22 (entre ellas `stock`, `cajas`, `comprobantes`, `compra_pagos`) tienen el
   permiso abierto pero RLS las bloquea por no tener política de escritura: están seguras por
   una sola capa.
2. **La auditoría se equivocó en `comprobantes`.** Dijo que solo tienen `GRANT SELECT`.
   `0010_facturacion.sql:416` otorga SELECT pero no revoca lo que `0005` ya había dado: un
   `grant` posterior solo AGREGA. Hoy no pasa nada porque RLS las bloquea, no porque el permiso
   esté cerrado.

Qué pasa en concreto con las 4 tablas auditadas: `ventas_insert`/`venta_items_insert` exigen
solo `fn_puede_operar_ubicacion` (poder operar en esa sede), no precio, stock, caja abierta ni
rol; `devoluciones_write` y `devolucion_items_write` son `for all`, es decir permiten UPDATE. Una
colaboradora con la consola abierta puede ponerle `estado='aprobada'` y `reembolso_metodo='efectivo'`
a su propia devolución sin ser líder y sin generar el movimiento de reposición, lo que descuadra
en silencio el arqueo de `cerrar_caja`.

## Decisión

**DECIDÍ:** revocar INSERT, UPDATE y DELETE a `authenticated` y `anon` sobre las 5 tablas
(`ventas`, `venta_items`, `devoluciones`, `devolucion_items`, `venta_anulacion_items`), dejando
SELECT. Las políticas quedan como documentación de lo que aplicaría si algún día se devuelve el
permiso, no como protección activa (mismo criterio que ADR-0055).

**DESCARTÉ:**
- **Cerrar las 10 tablas expuestas de una vez.** No se rastreó quién escribe en `transferencias`,
  `transferencia_items`, `conteos`, `lotes` y `clientes`. Revocar sin saberlo es como se rompe una
  pantalla con una clienta enfrente. Queda como trabajo aparte.
- **Cerrado por defecto** (quitar escritura a todo `retail`, devolverla solo a las 8 tablas de
  catálogo que la app escribe directo, y cambiar `alter default privileges` de `0005`). Es la
  solución de raíz — hoy toda tabla nueva nace abierta y depende de que alguien recuerde escribir
  bien su política — pero exige la lista exacta del inventario de producción y decidir qué hacer
  con 3 funciones que NO son `security definer` (`catalogo_actualizar_producto`, que aparece con
  dos firmas en local, y `catalogo_crear_producto`) y dependen del permiso de tabla.
- **No hacer nada hasta activar `FORCE ROW LEVEL SECURITY`.** Ya se descartó dos veces (ADR-0042,
  ADR-0055): las funciones `security definer` dejarían de saltarse las políticas y habría que
  reescribirlas todas.

**SE ROMPE SI:** alguien escribe una pantalla o script nuevo que inserte o actualice estas
tablas sin pasar por una función `security definer` — verá `permission denied for table ventas`.
La respuesta correcta no es devolver el permiso, es usar o crear la RPC. También si producción
tuviera una función que escriba aquí y NO fuera `security definer`; la consulta de verificación
corrida por Felipe el 2026-09-18 dice que no (6 funciones, todas `security definer`, dueña
`postgres`).

## Evidencia (verificada, no razonada)

- **Quién escribe en las 5 tablas:** `anular_venta`, `aprobar_devolucion`, `crear_devolucion`,
  `liquidar_prenda_danada`, `rechazar_devolucion`, `registrar_venta`. Todas `security definer`,
  dueña `postgres` (que también es dueña de las tablas), en local y en producción. Un `revoke`
  a `authenticated` no las toca: corren con los permisos de su dueña, no del que llama.
- **Triggers sobre estas tablas:** ninguno.
- **Qué escribe la app directo:** 14 escrituras en todo `apps/` y `packages/`, ninguna a estas
  tablas (son de catálogo: categorias, colores, tallas, tejidos, patrones, etiquetas,
  codigos_descuento, productos). Las pantallas de Punto de Venta, Devoluciones, Cambios y Anular
  venta usan `.rpc(...)`.
- **Prueba:** 16 casos, cada uno en su transacción con ROLLBACK. Los 2 primeros son de CONTROL:
  corren el mismo ataque SIN la migración y esperan que funcione, para demostrar que el hueco
  existía y que el harness sabe verlo. Luego 9 ataques rechazados, y 5 regresiones (leer, vender,
  devolver y aprobar, rechazar, anular) que siguen funcionando como `authenticated`.
  No cubre `liquidar_prenda_danada` (su fixture exige una prenda en cuarentena) ni PostgREST
  real: prueba el permiso de Postgres, que es la puerta que PostgREST cruza.

## Cómo se deshace

```sql
grant insert, update, delete on retail.ventas, retail.venta_items, retail.devoluciones,
  retail.devolucion_items, retail.venta_anulacion_items to authenticated;
```

Sin pérdida de datos: la migración no toca filas.

## Pendiente que este ADR NO cierra

- `transferencias`, `transferencia_items`, `conteos`, `lotes`, `clientes`: mismo patrón, sin
  rastrear.
- `0005_grants.sql` sigue dando escritura por defecto a toda tabla nueva. Mientras no se cambie,
  esta clase de hueco se vuelve a producir cada vez que se crea una tabla.
- 22 tablas dependen de una sola capa (RLS sin política de escritura).
- Todo lo medido sobre permisos y políticas es del Postgres LOCAL (107 migraciones aplicadas de
  125 archivos). Producción se confirmó solo en lo de las funciones. Antes de aplicar hay que
  correr `docs/datos/VERIFICAR-ESCRITURA-DIRECTA-2026-09-18.sql` allá y comparar.
