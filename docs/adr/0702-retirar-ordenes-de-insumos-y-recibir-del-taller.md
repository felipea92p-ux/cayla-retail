# ADR-0702 — Producción ▸ Abastecimiento se achica: salen «Órdenes de insumos» y «Recibir»

**Fecha:** 2026-11-25 · **Estado:** aceptado por Felipe. **Retira la fase 7 de ADR-0362.** La web se retira en este PR; la migración
`20261125231000_retirar_modulo_ordenes_insumos.sql` está **en producción desde el 2026-11-26** (pegada por Claude con el OK de Felipe,
antes de fusionar: la web de hoy solo pierde la pantalla de órdenes, sin uso; verificada en vivo).

## Contexto

Producción ▸ Abastecimiento tenía cinco pantallas: Órdenes de insumos, Proveedores, Facturas de insumos, Recibir y Por pagar. Pensado como
«pedir → factura → recibir → pagar», igual que Compras de tienda. En la práctica el Taller no trabaja así. Consultado en vivo el 2026-11-25
(solo lectura):

- **0 órdenes de insumos**, 0 líneas de `actividad` del módulo, 0 roles con esa pantalla principal. Un rol tenía el módulo asignado.
- Las **9 facturas** del Taller nacieron en otro lado: **8 de corte y ploteo** en Por pagar ▸ «Pagar servicio» (`pagar_servicio_de_orden`,
  sin papel, con `fase_id`) y **1 de tela** en Insumos ▸ «Llegó una compra» (`registrar_compra_de_insumos`, que factura y recibe en un paso).
  Ninguna desde el botón «+ Nueva factura» de Facturas de insumos.
- La única recepción (`comprobantes_produccion_recepciones`) la hizo «Llegó una compra» por dentro. La pantalla Recibir no tiene uso manual.

Felipe (2026-11-25): «ocultemos el botón de registrar factura en el módulo de facturas de insumos … para no causar confusión» y «también
eliminemos los otros módulos que no se usan». Eligió retirar el módulo del todo, con la migración.

## Decisión

1. **Facturas de insumos solo lista** (commit aparte): sin «+ Nueva factura» ni su formulario. Se consulta, se paga y se corrige.
2. **Sale «Órdenes de insumos»** entera de la web: `/ordenes-insumos`, sus componentes, reglas, guías, huellas y escenarios; su fila del
   menú y su clave en `CLAVES_MODULO`/`MODULOS`. El Resumen y la orden de producción ya no ofrecen «Pedir» ni «Ver los pedidos»: las
   decisiones del Taller mandan a Insumos (comprar) o a la factura (lo facturado que no llegó).
3. **Sale el «Recibir» del Taller** (`/produccion/recibir`, su panel y su hoja). «Llegó una compra» ya recibe; pierde el aviso de «pedido
   abierto», que solo servía con órdenes.
4. **Abastecimiento queda con Proveedores, Facturas de insumos y Por pagar.** Las tres piden ver el dinero; quien no lo ve ya no ve el subgrupo.
5. **La migración** (el camino de Liquidación, ADR-0653): se detiene si hay historia; saca `ordenes_insumos` de `lider_modulos_ocultos`,
   `rol_modulos` y `modulos`; pasa `fn_ordenes_insumo_nos_debe` (el aviso de faltantes que leen Facturas, Por pagar y Finanzas) a pedir el
   módulo Producción —si no, ese aviso se perdería en silencio—; y le quita a la web (`revoke execute`) las nueve funciones de la pantalla.
6. **`pruebas:ordenes-insumo-retirada`** reemplaza a `pruebas:ordenes-insumo`, `pruebas:comprobante-orden-insumo` y
   `pruebas:recepcion-orden-insumo`: sin el módulo, la base ya no deja crear una orden desde la web, que era lo que probaban.

## Qué NO hace, a propósito

- No borra tablas (`ordenes_insumo`, `orden_insumo_items`, `orden_insumo_recepciones`, `orden_insumo_cierres`, `orden_insumo_versiones`) ni
  funciones: quedan vacías, quietas y comentadas como RETIRADAS.
- No toca `registrar_comprobante_produccion`, `recibir_comprobante_produccion`, `registrar_compra_de_insumos` ni `pagar_servicio_de_orden`.
- No toca `fn_ordenes_insumo_por_recibir` ni `fn_orden_insumo_por_recibir_lineas` (lecturas con el módulo Producción; sin órdenes, vacías).
- Deja en el Resumen la lectura de lo que viene «en camino» de un pedido: sin órdenes siempre viene vacía. Sacarla toca la cuenta de tela
  de Producción; va aparte si hace falta.

## Se rompe si

- Se pega la migración **antes** de publicar la web: la web de hoy pide el módulo y llama a esas funciones (Órdenes de insumos daría «Sin acceso»).
- Alguien crea una orden de insumos en producción antes de pegarla: la migración se detiene (`ordenes_insumos_con_historia`) y no hace nada.

## Cómo se vuelve

`grant execute` de las nueve funciones a `authenticated`, la fila de `modulos` (la de `20261013035000`), `fn_ordenes_insumo_nos_debe` con
`fn_ve_modulo('ordenes_insumos')` y la web desde el commit anterior a este PR.

## Cómo se verifica

- `PRUEBA_CON_MIGRACION=supabase/migrations/20261125231000_retirar_modulo_ordenes_insumos.sql pnpm pruebas:ordenes-insumo-retirada` → 5/5.
- Producción, después de pegar: `select count(*) from retail.modulos where clave = 'ordenes_insumos'` → 0, y
  `select has_function_privilege('authenticated', 'retail.crear_orden_insumo(uuid,uuid,uuid,date,text,jsonb)', 'execute')` → false.
