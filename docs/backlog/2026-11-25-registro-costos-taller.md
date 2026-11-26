## 🧹 Achicar Producción ▸ Abastecimiento (2026-11-25, ADR-0702) — web + migración EN PRODUCCIÓN (2026-11-26); rama `claude/registro-costos-taller-930684`

- [x] Facturas de insumos sin «+ Nueva factura» ni su formulario.
- [x] Web: fuera `/ordenes-insumos` y `/produccion/recibir` (rutas, componentes, reglas, guías, huellas, escenarios, menú, ícono y clave del módulo).
- [x] Resumen y orden de producción sin «Pedir» ni «Ver los pedidos»; «Llegó una compra» sin el aviso de pedido abierto.
- [x] Migración `20261125231000_retirar_modulo_ordenes_insumos.sql` (se detiene si hay historia; quita el módulo; `fn_ordenes_insumo_nos_debe` pide Producción; `revoke execute` a 9 funciones).
- [x] `pruebas:ordenes-insumo-retirada` en el CI (reemplaza a las tres suites de órdenes de insumos).
- [x] Migración pegada en producción el 2026-11-26 con el OK de Felipe (antes de fusionar) y verificada: sin módulo ni roles, aviso con Producción, `crear_orden_insumo` cerrada.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) después de pegarla.
- [ ] «Tu fondo» en «Llegó una compra» y en «Pagar servicio» (hoy solo lo ofrecía la orden de insumos, que se fue): Claudia tiene S/ 3.000 de fondo para el Taller.
- [ ] Opcional: sacar del Resumen y de Nueva orden la lectura de «en camino» de los pedidos (siempre vacía sin órdenes).
