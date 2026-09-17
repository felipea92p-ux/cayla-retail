# ADR-0075 — Compras: la lectura queda acotada por sede, igual que ventas y movimientos

## Contexto

`compras`, `compra_items`, `compra_pagos` y `compra_adjuntos` (migraciones
`20260912231956_compras_desde_factura.sql` y `20260914180000_compras_adjuntos.sql`)
nacieron con una política de lectura `auth.role() = 'authenticated'` — cualquier
persona con sesión, sin mirar sede ni rol. A diferencia de `ventas` y `movimientos`
(`0004_rls.sql`), nunca se conectaron con `retail.fn_puede_operar_ubicacion`.

Verificado el 2026-09-17 con una transacción de prueba en local (rollback, sin
escribir nada): Micaela, integrante de Tienda Trujillo sin compras propias, veía
las 3 facturas de proveedor registradas en Taller y Tienda Lima — RUC, monto y
condición de pago — a través de `listar_compras`, `resumen_compras` y la vista
`compras_resumen` (la que usa `getCompra`). El mismo colaborador, sobre
`movimientos` y `ventas`, solo veía las filas de su propia sede — el candado ahí
sí funciona hoy.

De paso se corrigió un supuesto de la auditoría original: el bypass temporal de
`0012_control_total_temporal.sql` ("cualquier persona activa tiene control
total") ya NO está vigente — `0013_colaboradores_autorizados.sql` y
`0016_roles_colaborador.sql` lo reemplazaron por un chequeo real de
`retail.colaboradores.rol = 'lider'`, confirmado en local y en producción. El
registro de una factura (`registrar_compra`, vía `fn_puede_registrar_compras`)
ya era, y sigue siendo, solo para líderes — verificado: Micaela no puede
registrar, Felipe sí. El hueco era exclusivamente de LECTURA.

Producción tiene 0 filas en `compras` hoy (auditoría de Recibir mercadería,
2026-09-17): no hay datos reales ya filtrados, pero Compras está por entrar en
uso.

## Decisión

Protocolo `/decide` con Felipe, 2026-09-17: acotar TODA la lectura de Compras al
mismo patrón que ya usan ventas y movimientos — `retail.fn_puede_operar_ubicacion`
— en vez de dejarlo abierto a toda la empresa o partir lectura/escritura en dos
reglas distintas.

- Las 4 políticas de `select` pasan de `auth.role() = 'authenticated'` a
  `fn_puede_operar_ubicacion(ubicacion_destino_id)` (directo en `compras`; por
  `exists` contra `compras` en las otras tres, igual que `venta_items_select`).
- `resumen_compras()` gana el mismo filtro escrito a mano en cada subconsulta,
  porque es `security definer` y lee `compras` directo (no la vista) — sin
  `force row level security` en la tabla (no la tiene, verificado en local y
  producción), una función `security definer` no pasa por RLS en absoluto.
- `listar_compras()` NO necesitó tocarse: lee de la vista `compras_resumen`
  (`security_invoker = true`), así que hereda la política nueva sola.
- `fn_puede_registrar_compras()` no cambia — sigue siendo solo-líder,
  cualquier sede, igual que hoy.

Migración: `supabase/migrations/20260917173000_compras_candado_de_sede.sql`.

## Consecuencias

- Un colaborador (no líder) deja de ver facturas de proveedor de otra sede —
  verificado: Micaela ve su propia factura de prueba en Trujillo (1 fila) y
  cero de Taller/Lima, tanto en `listar_compras` como en la vista
  `compras_resumen`.
- Un líder no pierde nada: sigue viendo y registrando compras de cualquier
  sede — verificado con Felipe (líder, Tienda Lima): ve las 3 facturas.
- `recibir_compras`/`recibir_lote` no cambian (ya usaban
  `fn_puede_operar_ubicacion`); un colaborador sigue recibiendo mercadería
  contra facturas de su propia sede sin fricción nueva.
- Si en el futuro alguien agrega una RPC que lea `compras`/`compra_items`/
  `compra_pagos`/`compra_adjuntos` directo (no por la vista `compras_resumen`),
  RLS no la protege sola — tiene que repetir el chequeo de
  `fn_puede_operar_ubicacion` a mano, como ya hace `resumen_compras`.
- Pendiente: aplicar la migración en producción (SQL Editor, con prefijo
  `retail.`, ver CLAUDE.md "Cómo aplicar SQL a producción") — requiere el ok
  puntual de Felipe antes de pegarla, por ser un cambio de esquema de
  seguridad en producción.
- Sin verificar: si la misma auditoría de accesos del 2026-09-14 encontró el
  mismo patrón débil en tablas de Catálogo (no solo Compras), sigue sin
  tocar — esta sesión solo cubrió Compras.
